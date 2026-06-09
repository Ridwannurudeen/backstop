import { useMemo, useState } from "react";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import { useQuery } from "@tanstack/react-query";
import {
  fetchActiveOracles,
  fetchReferencePrice,
  quotePremium,
} from "../lib/predict";
import {
  fetchHoldings,
  estimateTreasuryUsd,
  buildBasketProtectionTx,
  type BasketLeg,
} from "../lib/portfolio";
import { getManager, setManager } from "../lib/manager";
import { createManagerTx } from "../lib/predict";
import { DEFAULT_SYMBOL } from "../lib/markets";
import { usd, fromMicro } from "../lib/format";
import { Notice, type NoticeState } from "./Notice";
import "./treasury.css";

const CRASH_OPTIONS = [10, 20, 30];
const COVERAGE_OPTIONS = [25, 50, 100];

export default function TreasuryProtect() {
  const account = useCurrentAccount()!;
  const client = useSuiClient();
  const { mutateAsync: sign, isPending } = useSignAndExecuteTransaction();

  const { data: holdings } = useQuery({
    queryKey: ["holdings", account.address],
    queryFn: () => fetchHoldings(client, account.address),
  });
  const { data: ref } = useQuery({
    queryKey: ["refprice"],
    queryFn: () => fetchReferencePrice(DEFAULT_SYMBOL),
  });
  const {
    data: oracles,
    isLoading: oraclesLoading,
    isError: oraclesError,
  } = useQuery({
    queryKey: ["oracles"],
    queryFn: () => fetchActiveOracles(DEFAULT_SYMBOL),
  });

  const [crashPct, setCrashPct] = useState(10);
  const [coveragePct, setCoveragePct] = useState(50);
  const [premium, setPremium] = useState<bigint | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<NoticeState | null>(null);

  const manager = getManager(account.address);
  const oracle = oracles?.[0];

  const estimate = useMemo(
    () => estimateTreasuryUsd(holdings ?? [], ref?.priceUsd ?? 0),
    [holdings, ref],
  );

  // Two-leg basket: strikes at -crashPct% and -2×crashPct% of the reference,
  // each leg sized to cover half of the chosen coverage amount.
  const legs = useMemo<BasketLeg[]>(() => {
    if (!ref || !oracle || estimate.totalUsd <= 0) return [];
    const min = oracle.minStrikeUsd; // can't insure below the oracle's lowest strike
    const coverUsd = (estimate.totalUsd * coveragePct) / 100;
    const perLeg = Math.max(1, Math.round(coverUsd / 2));
    const s1 = Math.max(
      min,
      Math.round((ref.priceUsd * (100 - crashPct)) / 100),
    );
    const s2 = Math.max(
      min,
      Math.round((ref.priceUsd * (100 - 2 * crashPct)) / 100),
    );
    // If both legs clamp to the same strike, collapse into one with the full size.
    if (Math.round(s1) === Math.round(s2))
      return [
        { strikeUsd: BigInt(Math.round(s1)), sizeUsd: BigInt(perLeg * 2) },
      ];
    return [
      { strikeUsd: BigInt(Math.round(s1)), sizeUsd: BigInt(perLeg) },
      { strikeUsd: BigInt(Math.round(s2)), sizeUsd: BigInt(perLeg) },
    ];
  }, [ref, oracle, estimate.totalUsd, coveragePct, crashPct]);

  const daysTo = (ms: bigint) =>
    Math.max(0, Math.round((Number(ms) - Date.now()) / 86_400_000));

  async function preview() {
    if (!oracle || !legs.length) return;
    setNotice(null);
    setPremium(null);
    try {
      const quotes = await Promise.all(
        legs.map((leg) =>
          quotePremium(
            client,
            {
              oracleId: oracle.oracleId,
              expiryMs: oracle.expiryMs,
              strikeUsd: leg.strikeUsd,
              sizeUsd: leg.sizeUsd,
            },
            account.address,
          ),
        ),
      );
      setPremium(quotes.reduce((sum, q) => sum + q.premium, 0n));
    } catch (e) {
      setNotice({ kind: "err", text: "Quote failed: " + (e as Error).message });
    }
  }

  async function setupManager() {
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
    return created.objectId;
  }

  async function insure() {
    if (!oracle || !legs.length) return;
    setBusy(true);
    setNotice(null);
    try {
      const managerId = manager ?? (await setupManager());
      const tx = await buildBasketProtectionTx(client, {
        owner: account.address,
        managerId,
        oracleId: oracle.oracleId,
        expiryMs: oracle.expiryMs,
        legs,
      });
      const { digest } = await sign({ transaction: tx });
      setNotice({ kind: "ok", text: "Treasury insured", digest });
    } catch (e) {
      setNotice({ kind: "err", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const coverUsd = (estimate.totalUsd * coveragePct) / 100;

  return (
    <div className="card">
      <h3>Insure my treasury</h3>
      <p className="muted">
        One transaction buys a basket of {DEFAULT_SYMBOL} crash policies sized
        to your holdings — payouts ladder in as the market falls.
        {ref && ` · ${DEFAULT_SYMBOL} ≈ ${usd(ref.priceUsd)} (last settled)`}
      </p>

      <div className="treasury-total">{usd(estimate.totalUsd)}</div>
      <div className="muted">estimated treasury value</div>

      {estimate.lines.length > 0 && (
        <div style={{ marginTop: 10 }}>
          {estimate.lines.map((l) => (
            <div className="holding" key={l.coinType}>
              <span className="sym">{l.symbol}</span>
              <span className="val">
                {l.valued ? usd(l.usd) : "not priced"}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="row" style={{ marginTop: 16 }}>
        <div className="field">
          <label>Crash to protect against</label>
          <div className="seg">
            {CRASH_OPTIONS.map((p) => (
              <button
                key={p}
                className={crashPct === p ? "on" : ""}
                onClick={() => {
                  setCrashPct(p);
                  setPremium(null);
                }}
              >
                -{p}%
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>Coverage of treasury</label>
          <div className="seg">
            {COVERAGE_OPTIONS.map((p) => (
              <button
                key={p}
                className={coveragePct === p ? "on" : ""}
                onClick={() => {
                  setCoveragePct(p);
                  setPremium(null);
                }}
              >
                {p}%
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>Term</label>
          <div className="seg">
            <button className="on" disabled>
              {oracle ? `${daysTo(oracle.expiryMs)}d` : "—"}
            </button>
          </div>
        </div>
      </div>

      {legs.length > 0 && ref && (
        <div style={{ marginTop: 6 }}>
          {legs.map((leg, i) => (
            <div className="leg-line" key={i}>
              <span>
                Leg {i + 1}: pays if {DEFAULT_SYMBOL} &lt;{" "}
                {usd(Number(leg.strikeUsd))}
              </span>
              <span className="v">cover {usd(Number(leg.sizeUsd))}</span>
            </div>
          ))}
          <div className="quote">
            <span className="k">Total coverage</span>
            <span className="v">{usd(coverUsd)}</span>
          </div>
        </div>
      )}

      <button
        className="btn"
        style={{ background: "var(--panel-2)", color: "var(--text)" }}
        disabled={!oracle || !legs.length}
        onClick={preview}
      >
        Preview premium
      </button>

      {premium !== null && (
        <div className="quote" style={{ marginTop: 10 }}>
          <span className="k">Premium (you pay)</span>
          <span className="v">{usd(fromMicro(premium))}</span>
        </div>
      )}

      <button
        className="btn"
        disabled={busy || isPending || !oracle || !legs.length}
        onClick={insure}
      >
        {busy
          ? "Insuring…"
          : manager
            ? "Insure my treasury"
            : "Set up & insure my treasury"}
      </button>

      {(oraclesError || (!oraclesLoading && (oracles ?? []).length === 0)) && (
        <div className="note">
          Live markets are temporarily unavailable — retrying.
        </div>
      )}

      {notice && <Notice {...notice} />}
    </div>
  );
}
