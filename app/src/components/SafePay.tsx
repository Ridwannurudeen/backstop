import { useEffect, useMemo, useState } from "react";
import {
  ConnectButton,
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
  useSuiClientContext,
} from "@mysten/dapp-kit";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  buildSafePayWithCoverTx,
  isDepegConfigComplete,
  loadDepegConfig,
  quoteDepegPremium,
  readDepegPool,
  toMist,
} from "../lib/depegPool";
import { MAINNET } from "../lib/deployment";
import { sui, txUrl } from "../lib/format";
import { Notice, type NoticeState } from "./Notice";
import "./terminal.css";

const COVER_TERMS = [7, 30];
const DAY_MS = 86_400_000;
const EXPIRY_SAFETY_MS = 60_000;
const MAINNET_CHAIN = "sui:mainnet" as const;

type SafePayReceipt = {
  digest: string;
  recipient: string;
  paymentMist: bigint;
  coverMist: bigint;
  premiumMist: bigint;
  expiryMs: number;
  policyId?: string;
};

const minBigint = (a: bigint, b: bigint) => (a < b ? a : b);

const validFeedId = (feedId?: string) =>
  feedId && /^[0-9a-f]{64}$/i.test(feedId) ? feedId : undefined;

const expiryForTerm = (termDays: number) =>
  BigInt(Date.now() + termDays * DAY_MS - EXPIRY_SAFETY_MS);

const compactDate = (ms: number) =>
  new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

const compactAddress = (address: string) =>
  `${address.slice(0, 6)}...${address.slice(-4)}`;

function normalizedAddress(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const normalized = normalizeSuiAddress(trimmed);
  return isValidSuiAddress(normalized) ? normalized : "";
}

function policyObjectFromChanges(
  changes: Awaited<
    ReturnType<ReturnType<typeof useSuiClient>["getTransactionBlock"]>
  >["objectChanges"],
): string | undefined {
  const created = changes?.find(
    (change) =>
      change.type === "created" &&
      "objectType" in change &&
      typeof change.objectType === "string" &&
      change.objectType.includes("::pyth_cover_pool::Policy<"),
  );
  return created && "objectId" in created ? created.objectId : undefined;
}

export default function SafePay() {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const qc = useQueryClient();
  const { network, selectNetwork } = useSuiClientContext();
  const { mutateAsync: sign, isPending } = useSignAndExecuteTransaction();
  const config = useMemo(loadDepegConfig, []);
  const [recipient, setRecipient] = useState("");
  const [paymentSui, setPaymentSui] = useState(0.01);
  const [coverSui, setCoverSui] = useState(0.01);
  const [termDays, setTermDays] = useState(7);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [receipt, setReceipt] = useState<SafePayReceipt | null>(null);

  const configured = isDepegConfigComplete(config);
  const onMainnet = network === MAINNET;
  const canRead = configured && onMainnet;
  const recipientAddress = normalizedAddress(recipient);

  useEffect(() => {
    if (configured && !onMainnet) {
      selectNetwork(MAINNET);
    }
  }, [configured, onMainnet, selectNetwork]);

  const { data: pool, error: poolError } = useQuery({
    queryKey: ["safepay-pool", network, config.pkg, config.poolId],
    queryFn: () => readDepegPool(client, config.poolId),
    enabled: canRead,
    refetchInterval: 15_000,
  });

  const coverMist = toMist(coverSui);
  const paymentMist = toMist(paymentSui);
  const termSecs = termDays * 86_400;
  const termExceedsMax =
    !!pool &&
    pool.maxPolicyDurationSecs !== null &&
    termSecs > pool.maxPolicyDurationSecs;
  const premiumMist =
    pool && !termExceedsMax
      ? quoteDepegPremium(pool, coverMist, termDays)
      : undefined;
  const collateralHeadroom =
    pool && pool.fundsMist > pool.totalCoverMist
      ? pool.fundsMist - pool.totalCoverMist
      : 0n;
  const capHeadroom =
    pool && pool.maxTotalCoverMist > 0n
      ? pool.maxTotalCoverMist > pool.totalCoverMist
        ? pool.maxTotalCoverMist - pool.totalCoverMist
        : 0n
      : collateralHeadroom;
  const underwritingHeadroom = pool
    ? minBigint(collateralHeadroom, capHeadroom)
    : 0n;
  const maxNewCover =
    pool && pool.maxCoverPerPolicyMist > 0n
      ? minBigint(underwritingHeadroom, pool.maxCoverPerPolicyMist)
      : underwritingHeadroom;
  const coverExceedsLimit = !!pool && coverMist > maxNewCover;
  const poolEpochOpen = !!pool && (pool.epochArmed || pool.epochBreached);
  const safePayDisabled =
    !account ||
    !canRead ||
    !recipientAddress ||
    isPending ||
    paymentMist <= 0n ||
    coverMist <= 0n ||
    premiumMist === undefined ||
    !pool?.directSalesEnabled ||
    !!pool.paused ||
    poolEpochOpen ||
    termExceedsMax ||
    coverExceedsLimit;
  const totalMist =
    premiumMist === undefined ? paymentMist : paymentMist + premiumMist;
  const steps = [
    ["Split", `${sui(paymentMist)} payment + premium coin`],
    ["Check", "fresh Pyth sale guard"],
    ["Cover", `${sui(coverMist)} policy object`],
    [
      "Deliver",
      recipientAddress ? compactAddress(recipientAddress) : "recipient",
    ],
  ];

  async function executeSafePay() {
    if (!account || !premiumMist || !recipientAddress) return;
    setNotice(null);
    setReceipt(null);
    try {
      const expiryMs = Number(expiryForTerm(termDays));
      const transaction = await buildSafePayWithCoverTx({
        client,
        pkg: config.pkg,
        poolId: config.poolId,
        paymentMist,
        premiumMist,
        coverMist,
        expiryMs: BigInt(expiryMs),
        payer: account.address,
        recipient: recipientAddress,
        feedId: validFeedId(pool?.feedIdHex),
      });
      transaction.setSenderIfNotSet(account.address);
      const { digest } = await sign({ transaction, chain: MAINNET_CHAIN });
      await client.waitForTransaction({ digest });
      const block = await client.getTransactionBlock({
        digest,
        options: { showObjectChanges: true },
      });
      const policyId = policyObjectFromChanges(block.objectChanges);
      setReceipt({
        digest,
        recipient: recipientAddress,
        paymentMist,
        coverMist,
        premiumMist,
        expiryMs,
        policyId,
      });
      setNotice({
        kind: "ok",
        text: "SafePay settled with attached cover",
        digest,
        network: "mainnet",
      });
      qc.invalidateQueries({
        predicate: (q) => /^depeg-|^safepay-/.test(String(q.queryKey[0])),
      });
    } catch (e) {
      setNotice({ kind: "err", text: (e as Error).message });
    }
  }

  return (
    <section className="card safepay-card" id="safe-pay">
      <div className="safepay-head">
        <div>
          <h3>
            SafePay <span className="sub">- protected payment PTB</span>
          </h3>
          <p className="lead">
            Send SUI and attach a recipient-owned depeg policy in the same
            transaction. If suiUSDe is too close to the floor, the cover leg
            aborts and the payment does not settle.
          </p>
        </div>
        <div className="safepay-total">
          <span>total debit</span>
          <strong>{sui(totalMist)}</strong>
        </div>
      </div>

      {!account && (
        <div style={{ marginTop: 12 }}>
          <ConnectButton />
        </div>
      )}
      {configured && !onMainnet && (
        <button
          className="btn ghost"
          style={{ width: "auto" }}
          onClick={() => selectNetwork(MAINNET)}
        >
          Switch app to Sui mainnet
        </button>
      )}
      {poolError && (
        <p className="note err">
          SafePay pool read failed: {(poolError as Error).message}
        </p>
      )}

      <div className="safepay-grid">
        <div className="field">
          <label>Recipient address</label>
          <div className="safepay-recipient">
            <input
              className="mono"
              placeholder="0x..."
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
            />
            <button
              className="btn ghost"
              disabled={!account}
              onClick={() => account && setRecipient(account.address)}
            >
              Use self
            </button>
          </div>
          {recipient && !recipientAddress && (
            <p className="note err">Recipient must be a valid Sui address.</p>
          )}
        </div>
        <div className="field">
          <label>Payment (SUI)</label>
          <input
            type="number"
            min={0}
            step={0.001}
            value={paymentSui}
            onChange={(e) => setPaymentSui(+e.target.value)}
          />
        </div>
        <div className="field">
          <label>Attached cover (SUI payout)</label>
          <input
            type="number"
            min={0}
            step={0.001}
            value={coverSui}
            onChange={(e) => setCoverSui(+e.target.value)}
          />
        </div>
        <div className="field">
          <label>Protection term</label>
          <select
            value={termDays}
            onChange={(e) => setTermDays(+e.target.value)}
          >
            {COVER_TERMS.map((term) => (
              <option
                disabled={
                  pool !== undefined &&
                  pool.maxPolicyDurationSecs !== null &&
                  term * 86_400 > pool.maxPolicyDurationSecs
                }
                key={term}
                value={term}
              >
                {term}d
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="safepay-flow" aria-label="SafePay transaction flow">
        {steps.map(([label, detail], index) => (
          <div className="safepay-step" key={label}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{label}</strong>
            <small>{detail}</small>
          </div>
        ))}
      </div>

      <div className="safepay-summary">
        <div className="quote">
          <span className="k">Recipient receives</span>
          <span className="v">
            {recipientAddress
              ? `${sui(paymentMist)} + policy`
              : "payment + policy"}
          </span>
        </div>
        <div className="quote">
          <span className="k">Premium</span>
          <span className="v">
            {premiumMist !== undefined ? sui(premiumMist) : "-"}
          </span>
        </div>
        <div className="quote">
          <span className="k">Cover headroom</span>
          <span className="v">{pool ? sui(maxNewCover) : "-"}</span>
        </div>
        <div className="quote">
          <span className="k">Pool mode</span>
          <span className="v">
            {pool
              ? pool.directSalesEnabled
                ? "direct-sale open"
                : "adapter-only"
              : "-"}
          </span>
        </div>
      </div>

      {coverExceedsLimit && (
        <p className="note err">
          Attached cover exceeds current pool headroom or per-policy caps.
        </p>
      )}
      {termExceedsMax && (
        <p className="note err">
          Selected term exceeds this pool's maximum policy duration.
        </p>
      )}
      {pool && !pool.directSalesEnabled && (
        <p className="note">
          SafePay uses the open direct-sale pool. The custody production pool
          stays adapter-only.
        </p>
      )}
      {poolEpochOpen && (
        <p className="note err">
          The pool is in an open depeg epoch. New SafePay cover cannot be bought
          until recovery is recorded.
        </p>
      )}

      <button
        className="btn"
        disabled={safePayDisabled}
        onClick={() => void executeSafePay()}
      >
        {isPending ? "Signing..." : "Send SafePay"}
      </button>

      {notice && <Notice {...notice} />}

      {receipt && (
        <div className="safepay-receipt">
          <div className="safepay-receipt-head">
            <h4>SafePay receipt</h4>
            <a
              href={txUrl(receipt.digest, "mainnet")}
              target="_blank"
              rel="noreferrer"
            >
              Transaction
            </a>
          </div>
          <div className="safepay-summary">
            <div className="quote">
              <span className="k">Recipient</span>
              <span className="v mono">
                {compactAddress(receipt.recipient)}
              </span>
            </div>
            <div className="quote">
              <span className="k">Payment</span>
              <span className="v">{sui(receipt.paymentMist)}</span>
            </div>
            <div className="quote">
              <span className="k">Cover</span>
              <span className="v">{sui(receipt.coverMist)}</span>
            </div>
            <div className="quote">
              <span className="k">Premium</span>
              <span className="v">{sui(receipt.premiumMist)}</span>
            </div>
            <div className="quote">
              <span className="k">Expires</span>
              <span className="v">{compactDate(receipt.expiryMs)}</span>
            </div>
            <div className="quote">
              <span className="k">Policy</span>
              <span className="v mono">
                {receipt.policyId
                  ? compactAddress(receipt.policyId)
                  : "created"}
              </span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
