import { useSuiClient } from "@mysten/dapp-kit";
import { useQuery } from "@tanstack/react-query";
import { READING_EVENT, WALRUS_AGGREGATOR } from "../lib/deployment";

type ReadingEvent = {
  market: string;
  prob_bps: string;
  ref_price: string;
  walrus_blob: string;
  ts_ms: string;
};

type CheckedReading = ReadingEvent & { proof: "ok" | "stale" | "unknown" };

export default function OnchainRiskFeed() {
  const client = useSuiClient();
  const { data } = useQuery({
    queryKey: ["riskfeed-events"],
    queryFn: async (): Promise<CheckedReading[]> => {
      const r = await client.queryEvents({
        query: { MoveEventType: READING_EVENT },
        limit: 25,
        order: "descending",
      });
      const events = r.data
        .map((e) => e.parsedJson as ReadingEvent)
        // Only the agent's BTC-oracle readings ("BTC<strike@expiry") belong in
        // this Walrus-proven ledger; cover-pool markets (e.g. "BTC-CRASH-30D")
        // are operational oracle inputs for the parametric pool, not proofs here.
        .filter((e) => e.market.includes("<") && e.market.includes("@"));
      // Latest reading per market (events are newest-first).
      const seen = new Set<string>();
      const latest = events.filter((e) =>
        seen.has(e.market) ? false : (seen.add(e.market), true),
      );
      // Surface only the most recent publish batch — readings whose Walrus blobs
      // are still within retention. Older batches' blobs may have expired.
      const maxTs = latest.reduce((m, e) => Math.max(m, Number(e.ts_ms)), 0);
      const recent = latest.filter(
        (e) => Number(e.ts_ms) >= maxTs - 6 * 3_600_000,
      );
      // Proof-health: confirm each blob is retrievable; best-effort (a CORS/network
      // error is "unknown", not "stale", so we never falsely hide a live reading).
      return Promise.all(
        recent.map(async (e) => {
          try {
            const res = await fetch(`${WALRUS_AGGREGATOR}/${e.walrus_blob}`, {
              method: "HEAD",
            });
            return { ...e, proof: res.ok ? "ok" : "stale" } as CheckedReading;
          } catch {
            return { ...e, proof: "unknown" } as CheckedReading;
          }
        }),
      );
    },
    refetchInterval: 60_000,
  });

  const latest = (data ?? []).filter((r) => r.proof !== "stale");

  return (
    <div className="card">
      <h3>
        On-chain RiskFeed{" "}
        <span className="sub">- testnet probability feed</span>
      </h3>
      <p className="lead">
        DeepBook readings publish market-implied probability data on testnet,
        with Walrus evidence for the input packet. Challenge resolution is
        admin-governed today, so this is a research feed rather than the
        production depeg settlement oracle.
      </p>
      {latest.length === 0 ? (
        <p className="muted">No on-chain readings found yet.</p>
      ) : (
        latest.map((r, i) => (
          <div className="quote" key={i}>
            <span className="k">{r.market}</span>
            <span className="v">
              {(Number(r.prob_bps) / 100).toFixed(2)}%{" "}
              <a
                href={`${WALRUS_AGGREGATOR}/${r.walrus_blob}`}
                target="_blank"
                rel="noreferrer"
                style={{ marginLeft: 10 }}
              >
                evidence -&gt;
              </a>
            </span>
          </div>
        ))
      )}
    </div>
  );
}
