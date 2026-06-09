import { useEffect, useState } from "react";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import { useQuery } from "@tanstack/react-query";
import {
  buildBuyProtectionTx,
  createManagerTx,
  quotePremium,
  fetchActiveOracles,
  fetchReferencePrice,
} from "../lib/predict";
import { getManager, setManager } from "../lib/manager";
import { DEFAULT_SYMBOL } from "../lib/markets";
import { usd, fromMicro } from "../lib/format";
import { Notice, type NoticeState } from "./Notice";

export default function BuyProtection() {
  const account = useCurrentAccount()!;
  const client = useSuiClient();
  const { mutateAsync: sign, isPending } = useSignAndExecuteTransaction();

  const {
    data: oracles,
    isLoading: oraclesLoading,
    isError: oraclesError,
  } = useQuery({
    queryKey: ["oracles"],
    queryFn: () => fetchActiveOracles(DEFAULT_SYMBOL),
  });
  const { data: ref } = useQuery({
    queryKey: ["refprice"],
    queryFn: () => fetchReferencePrice(DEFAULT_SYMBOL),
  });

  const [oracleIdx, setOracleIdx] = useState(0);
  const [strikeUsd, setStrikeUsd] = useState<number | "">("");
  const [sizeUsd, setSizeUsd] = useState(100);
  const [quote, setQuote] = useState<{
    premium: bigint;
    bid: bigint;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<NoticeState | null>(null);

  const manager = getManager(account.address);
  const oracle = oracles?.[oracleIdx];

  // Default strike to ~10% below the reference price once it loads.
  useEffect(() => {
    if (ref && strikeUsd === "") {
      setStrikeUsd(
        Math.max(1000, Math.round((ref.priceUsd * 0.9) / 1000) * 1000),
      );
    }
  }, [ref, strikeUsd]);

  const daysTo = (ms: bigint) =>
    Math.max(0, Math.round((Number(ms) - Date.now()) / 86_400_000));

  async function setupManager() {
    setNotice(null);
    try {
      const { digest } = await sign({ transaction: createManagerTx() });
      await client.waitForTransaction({ digest });
      const tb = await client.getTransactionBlock({
        digest,
        options: { showObjectChanges: true },
      });
      const created = tb.objectChanges?.find(
        (c) => c.type === "created" && c.objectType.includes("Manager"),
      );
      if (!created || created.type !== "created")
        throw new Error("manager id not in tx " + digest);
      setManager(account.address, created.objectId);
      setNotice({
        kind: "ok",
        text: "Insurance account ready — buy your first policy.",
      });
    } catch (e) {
      setNotice({ kind: "err", text: (e as Error).message });
    }
  }

  async function getQuote() {
    if (!oracle || strikeUsd === "") return;
    setNotice(null);
    try {
      const q = await quotePremium(
        client,
        {
          oracleId: oracle.oracleId,
          expiryMs: oracle.expiryMs,
          strikeUsd: BigInt(strikeUsd),
          sizeUsd: BigInt(sizeUsd),
        },
        account.address,
      );
      setQuote(q);
    } catch (e) {
      setNotice({ kind: "err", text: "Quote failed: " + (e as Error).message });
    }
  }

  async function buy() {
    if (!manager || !oracle || strikeUsd === "") return;
    setBusy(true);
    setNotice(null);
    try {
      const tx = await buildBuyProtectionTx(client, {
        owner: account.address,
        managerId: manager,
        oracleId: oracle.oracleId,
        expiryMs: oracle.expiryMs,
        strikeUsd: BigInt(strikeUsd),
        sizeUsd: BigInt(sizeUsd),
      });
      const { digest } = await sign({ transaction: tx });
      setNotice({ kind: "ok", text: "Protection bought", digest });
    } catch (e) {
      setNotice({ kind: "err", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h3>Insure against a {DEFAULT_SYMBOL} crash</h3>
      <p className="muted">
        Pays out if {DEFAULT_SYMBOL} falls below your strike by expiry.
        Trustless oracle settlement, &lt;400ms.
        {ref && ` · ${DEFAULT_SYMBOL} ≈ ${usd(ref.priceUsd)} (last settled)`}
      </p>

      <div className="row">
        <div className="field">
          <label>Protect if {DEFAULT_SYMBOL} drops below ($)</label>
          <input
            type="number"
            value={strikeUsd}
            onChange={(e) =>
              setStrikeUsd(e.target.value === "" ? "" : +e.target.value)
            }
          />
        </div>
        <div className="field">
          <label>Amount to insure ($)</label>
          <input
            type="number"
            value={sizeUsd}
            onChange={(e) => setSizeUsd(+e.target.value)}
          />
        </div>
        <div className="field">
          <label>Term</label>
          <select
            value={oracleIdx}
            onChange={(e) => setOracleIdx(+e.target.value)}
          >
            {(oracles ?? []).map((o, i) => (
              <option key={o.oracleId} value={i}>
                {daysTo(o.expiryMs)}d
              </option>
            ))}
          </select>
        </div>
      </div>

      {(oraclesError || (!oraclesLoading && (oracles ?? []).length === 0)) && (
        <div className="note">
          Live markets are temporarily unavailable — retrying.
        </div>
      )}

      <button
        className="btn"
        style={{ background: "var(--panel-2)", color: "var(--text)" }}
        disabled={!oracle}
        onClick={getQuote}
      >
        Get quote
      </button>

      {quote && (
        <div style={{ marginTop: 14 }}>
          <div className="quote">
            <span className="k">Premium (you pay)</span>
            <span className="v">{usd(fromMicro(quote.premium))}</span>
          </div>
          <div className="quote">
            <span className="k">Max payout if it pays out</span>
            <span className="v">{usd(sizeUsd)}</span>
          </div>
        </div>
      )}

      {manager ? (
        <button
          className="btn"
          disabled={busy || isPending || !oracle}
          onClick={buy}
        >
          {busy ? "Buying…" : "Buy protection"}
        </button>
      ) : (
        <button className="btn" disabled={isPending} onClick={setupManager}>
          {isPending ? "Setting up…" : "Set up insurance account (one-time)"}
        </button>
      )}

      {notice && <Notice {...notice} />}
    </div>
  );
}
