import { useMemo, useState } from "react";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import { useQuery } from "@tanstack/react-query";
import {
  buildDepegBuyCoverTx,
  quoteDepegPremium,
  readDepegPool,
} from "@gudman/backstop-sdk";
import { objectUrl, txUrl } from "../lib/format";
import { MAINNET_DEPEG_PROOF_PACK } from "../lib/proofData";

const SAMPLE_OBLIGATION_ID =
  "0xffff7cfccd5049bc6f5adb20a770a822f920a3f78690213b08c231884763bf6a";
const SAMPLE_OWNER_CAP_ID =
  "0x16ee69982511332c08dc697c878c3d943e52d6be8c303ec27807a406207d6122";
const SAMPLE_TX = "2PBCaEbBHiFLU7fDwU4zihUq4CQtKArbXXC9JygTL169";
const MAINNET_JUDGE_GRADE_PURCHASE_TX =
  "5AGzShNPABk9RMGmmFursqRgJiGLssLpdjW5b6z4kb74";
const MAINNET_JUDGE_GRADE_POLICY_ID =
  "0xcfd02fb3db64b76ca57f39bf2669a6cae6766713f593c0a52eaa5fa02aa79a46";
const MIST_PER_SUI = 1_000_000_000;

type SuilendExposure = {
  obligationId: string;
  ownerCapId: string;
  lendingMarketId: string;
  depositedValueUsd: number;
  borrowedValueUsd: number;
  allowedBorrowUsd: number;
  unhealthyBorrowUsd: number;
  utilizationBps: number;
  deposits: {
    assetType: string;
    reserveArrayIndex: number;
    cTokenAmount: string;
    marketValueUsd: number;
  }[];
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function fieldsOf(value: unknown) {
  return record(record(value)?.fields);
}

function decimal(value: unknown) {
  const fields = fieldsOf(value);
  const raw = fields?.value ?? record(value)?.value ?? value;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed / 1e18 : 0;
}

function stringField(value: unknown) {
  return typeof value === "string" ? value : "";
}

function typeName(value: unknown) {
  return stringField(fieldsOf(value)?.name);
}

function normalizeCoinType(name: string) {
  if (
    name.startsWith(
      "0000000000000000000000000000000000000000000000000000000000000002::",
    )
  ) {
    return `0x2::${name.split("::").slice(1).join("::")}`;
  }
  return name.startsWith("0x") ? name : `0x${name}`;
}

function mistToSui(amount: bigint) {
  return Number(amount) / MIST_PER_SUI;
}

function suiToMist(amount: number) {
  return BigInt(Math.max(0, Math.round(amount * MIST_PER_SUI)));
}

function ownerAddress(owner: unknown) {
  const ownerRecord = record(owner);
  const address = ownerRecord?.AddressOwner;
  return typeof address === "string" ? address : null;
}

async function fetchObject(
  client: ReturnType<typeof useSuiClient>,
  objectId: string,
) {
  const response = await client.getObject({
    id: objectId,
    options: { showContent: true, showOwner: true, showType: true },
  });
  return response.data ?? null;
}

function parseExposure(object: Awaited<ReturnType<typeof fetchObject>>) {
  const content = object?.content;
  if (!content || content.dataType !== "moveObject") return null;

  const fields = content.fields as Record<string, unknown>;
  const deposits = Array.isArray(fields.deposits) ? fields.deposits : [];
  const parsedDeposits = deposits
    .map((deposit) => {
      const depositFields = fieldsOf(deposit);
      if (!depositFields) return null;
      return {
        assetType: normalizeCoinType(typeName(depositFields.coin_type)),
        reserveArrayIndex: Number(depositFields.reserve_array_index ?? 0),
        cTokenAmount: stringField(depositFields.deposited_ctoken_amount),
        marketValueUsd: decimal(depositFields.market_value),
      };
    })
    .filter((deposit): deposit is SuilendExposure["deposits"][number] =>
      Boolean(deposit),
    );

  const allowedBorrowUsd = decimal(fields.allowed_borrow_value_usd);
  const borrowedValueUsd = decimal(fields.weighted_borrowed_value_usd);

  return {
    obligationId: SAMPLE_OBLIGATION_ID,
    ownerCapId: SAMPLE_OWNER_CAP_ID,
    lendingMarketId: stringField(fields.lending_market_id),
    depositedValueUsd: decimal(fields.deposited_value_usd),
    borrowedValueUsd,
    allowedBorrowUsd,
    unhealthyBorrowUsd: decimal(fields.unhealthy_borrow_value_usd),
    utilizationBps:
      allowedBorrowUsd > 0
        ? Math.round((borrowedValueUsd / allowedBorrowUsd) * 10_000)
        : 0,
    deposits: parsedDeposits,
  };
}

export default function SuilendCover() {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const { mutateAsync: sign, isPending } = useSignAndExecuteTransaction();
  const depeg = MAINNET_DEPEG_PROOF_PACK.depegPool!;
  const [coverSui, setCoverSui] = useState(0.01);
  const [termDays, setTermDays] = useState(14);
  const [consent, setConsent] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const { data: obligation } = useQuery({
    queryKey: ["suilend-sample-obligation", SAMPLE_OBLIGATION_ID],
    queryFn: () => fetchObject(client, SAMPLE_OBLIGATION_ID),
    refetchInterval: 20_000,
  });

  const { data: ownerCap } = useQuery({
    queryKey: ["suilend-sample-owner-cap", SAMPLE_OWNER_CAP_ID],
    queryFn: () => fetchObject(client, SAMPLE_OWNER_CAP_ID),
    refetchInterval: 20_000,
  });

  const { data: pool } = useQuery({
    queryKey: ["suilend-bound-depeg-pool", depeg.poolId],
    queryFn: () => readDepegPool(client, depeg.poolId),
    refetchInterval: 20_000,
  });

  const exposure = useMemo(
    () => parseExposure(obligation ?? null),
    [obligation],
  );
  const owner = ownerAddress(ownerCap?.owner);
  const ownsSample = Boolean(
    account?.address &&
    owner &&
    account.address.toLowerCase() === owner.toLowerCase(),
  );
  const coverMist = suiToMist(coverSui);
  const premiumMist =
    pool && coverMist > 0n
      ? quoteDepegPremium(pool, coverMist, termDays)
      : null;
  const canBuy = Boolean(
    account && ownsSample && consent && premiumMist && coverMist > 0n,
  );

  async function buyBoundPolicy() {
    if (!account || !premiumMist) return;
    setMessage(null);
    try {
      const expiryMs = BigInt(Date.now() + termDays * 86_400_000 - 60_000);
      const tx = buildDepegBuyCoverTx({
        pkg: depeg.packageId,
        poolId: depeg.poolId,
        premiumMist,
        coverMist,
        expiryMs,
        owner: account.address,
      });
      const result = await sign({ transaction: tx });
      setMessage(`Policy submitted: ${result.digest}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <section className="card suilend-cover">
      <div className="proof-head">
        <div>
          <div className="eyebrow">Suilend adapter pilot</div>
          <h3>Bind a real Suilend obligation to a Backstop quote</h3>
          <p className="muted">
            This flow reads the sample Suilend obligation created from your
            deposit, normalizes the collateral exposure, and lets the owner buy
            a Backstop policy only after explicit consent.
          </p>
        </div>
        <div className="proof-pill">sample-validated</div>
      </div>

      <div className="proof-strip proof-strip-wide">
        <div className="proof-item">
          <div className="k">Obligation</div>
          <div className="v">{SAMPLE_OBLIGATION_ID}</div>
          <a
            href={objectUrl(SAMPLE_OBLIGATION_ID, "mainnet")}
            target="_blank"
            rel="noreferrer"
          >
            open
          </a>
        </div>
        <div className="proof-item">
          <div className="k">Owner cap</div>
          <div className="v">{SAMPLE_OWNER_CAP_ID}</div>
          <div className="muted">{owner ?? "Loading owner"}</div>
        </div>
        <div className="proof-item">
          <div className="k">Sample tx</div>
          <div className="v">{SAMPLE_TX}</div>
          <a
            href={txUrl(SAMPLE_TX, "mainnet")}
            target="_blank"
            rel="noreferrer"
          >
            open
          </a>
        </div>
        <div className="proof-item">
          <div className="k">Judge-grade policy purchase</div>
          <div className="v">{MAINNET_JUDGE_GRADE_POLICY_ID}</div>
          <a
            href={txUrl(MAINNET_JUDGE_GRADE_PURCHASE_TX, "mainnet")}
            target="_blank"
            rel="noreferrer"
          >
            open tx
          </a>
        </div>
      </div>

      <div className="suilend-flow-grid">
        <article className="suilend-panel">
          <span>Parsed exposure</span>
          <h3>
            ${exposure ? exposure.depositedValueUsd.toFixed(4) : "loading"} SUI
            collateral
          </h3>
          <p className="muted">
            Borrowed $
            {exposure ? exposure.borrowedValueUsd.toFixed(4) : "0.0000"} /
            utilization {exposure ? exposure.utilizationBps : 0} bps.
          </p>
          {(exposure?.deposits ?? []).map((deposit) => (
            <div className="passport-detail" key={deposit.assetType}>
              <b>{deposit.assetType}</b>
              <em>
                ${deposit.marketValueUsd.toFixed(4)} value / cToken{" "}
                {deposit.cTokenAmount}
              </em>
            </div>
          ))}
        </article>

        <article className="suilend-panel">
          <span>Policy quote</span>
          <div className="row">
            <div className="field">
              <label>Cover amount (SUI)</label>
              <input
                min="0.001"
                step="0.001"
                type="number"
                value={coverSui}
                onChange={(event) => setCoverSui(Number(event.target.value))}
              />
            </div>
            <div className="field">
              <label>Term</label>
              <select
                value={termDays}
                onChange={(event) => setTermDays(Number(event.target.value))}
              >
                <option value={7}>7 days</option>
                <option value={14}>14 days</option>
                <option value={30}>30 days</option>
              </select>
            </div>
          </div>
          <div className="quote">
            <span className="k">Premium</span>
            <span className="v">
              {premiumMist
                ? `${mistToSui(premiumMist).toFixed(6)} SUI`
                : "Loading"}
            </span>
          </div>
          <div className="quote">
            <span className="k">Evidence binding</span>
            <span className="v">Suilend obligation + owner cap</span>
          </div>
        </article>
      </div>

      <label className="consent-row">
        <input
          checked={consent}
          onChange={(event) => setConsent(event.target.checked)}
          type="checkbox"
        />
        <span>
          I understand this buys a Backstop mainnet depeg policy and uses the
          Suilend obligation as adapter evidence. This is not Suilend production
          auto-cover and does not borrow, withdraw, or mutate the Suilend
          position.
        </span>
      </label>

      {!account && (
        <p className="note">Connect the wallet that owns the owner cap.</p>
      )}
      {account && !ownsSample && (
        <p className="note err">
          Connected wallet does not own this Suilend obligation owner cap.
        </p>
      )}

      <button
        className="btn"
        disabled={!canBuy || isPending}
        onClick={buyBoundPolicy}
        type="button"
      >
        Buy adapter-bound policy
      </button>

      {message && (
        <p
          className={
            message.startsWith("Policy submitted") ? "note ok" : "note err"
          }
        >
          {message.startsWith("Policy submitted") ? (
            <a
              href={txUrl(message.replace("Policy submitted: ", ""), "mainnet")}
              target="_blank"
              rel="noreferrer"
            >
              {message}
            </a>
          ) : (
            message
          )}
        </p>
      )}

      <p className="note">
        Boundary: the policy is still a Backstop policy owned by the connected
        wallet. Production Suilend auto-cover still needs parser versioning,
        consent UX, and governance caps.
      </p>
    </section>
  );
}
