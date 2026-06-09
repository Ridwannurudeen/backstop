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

export default function OnchainRiskFeed() {
  const client = useSuiClient();
  const { data } = useQuery({
    queryKey: ["riskfeed-events"],
    queryFn: async () => {
      const r = await client.queryEvents({
        query: { MoveEventType: READING_EVENT },
        limit: 25,
        order: "descending",
      });
      return r.data.map((e) => e.parsedJson as ReadingEvent);
    },
    refetchInterval: 20_000,
  });

  // Latest reading per market (events are newest-first).
  const seen = new Set<string>();
  const latest = (data ?? []).filter((r) =>
    seen.has(r.market) ? false : (seen.add(r.market), true),
  );

  return (
    <div className="card">
      <h3>
        On-chain RiskFeed{" "}
        <span className="muted" style={{ fontWeight: 400 }}>
          · probability-of-failure oracle
        </span>
      </h3>
      <p className="muted">
        Backstop publishes each market-implied probability of failure on-chain
        as a <b>RiskFeed</b> object any Sui contract can read — with a Walrus
        proof of the inputs. Read live from the deployed package below.
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
                style={{
                  color: "var(--accent)",
                  textDecoration: "none",
                  marginLeft: 8,
                }}
              >
                proof ↗
              </a>
            </span>
          </div>
        ))
      )}
    </div>
  );
}
