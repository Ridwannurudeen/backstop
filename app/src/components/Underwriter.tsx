import { useQuery } from "@tanstack/react-query";
import { usd, txUrl } from "../lib/format";
import "./underwriter.css";

type AgentDecision = {
  input: {
    symbol: string;
    strikeUsd: number;
    expiryMs: string;
    referencePriceUsd: number | null;
    impliedCrashProb: number;
    premiumUsd: number;
    sizeUsd: number;
  };
  decision: {
    accept: boolean;
    maxCapacityUsd: number;
    premiumBps: number;
    rationale: string;
    source: "claude" | "rules";
  };
  execution:
    | {
        executed: true;
        digest: string;
        amountUsd: number;
        plpObjectId: string | null;
      }
    | { executed: false; reason: string };
  timestamp: string;
  walrusBlobId: string | null;
  walrusUrl: string | null;
};

type DecisionsFile = { generatedAt: string; decisions: AgentDecision[] };

async function fetchDecisions(): Promise<DecisionsFile | null> {
  const r = await fetch("/agent-decisions.json", { cache: "no-store" });
  if (!r.ok) return null;
  return r.json();
}

const daysTo = (ms: string) =>
  Math.max(0, Math.round((Number(ms) - Date.now()) / 86_400_000));

export default function Underwriter() {
  const { data, isLoading } = useQuery({
    queryKey: ["agent-decisions"],
    queryFn: fetchDecisions,
    refetchInterval: 15_000,
  });

  const decisions = data?.decisions ?? [];

  const track = {
    evaluated: decisions.length,
    accepted: decisions.filter((d) => d.decision.accept).length,
    suppliedUsd: decisions.reduce(
      (s, d) => s + (d.execution.executed ? d.execution.amountUsd : 0),
      0,
    ),
    proofs: decisions.filter((d) => d.walrusUrl).length,
  };

  return (
    <div className="card">
      <h3>Underwriting decision receipts</h3>
      <p className="muted">
        The Sui testnet lab reads DeepBook Predict's volatility surface, turns
        it into a market-implied <b>probability of failure</b>, prices capacity
        and premium, then records each accept or decline to Walrus.{" "}
        {data && (
          <span>Last run {new Date(data.generatedAt).toLocaleString()}</span>
        )}
      </p>

      {decisions.length > 0 && (
        <div
          className="uw-stats"
          title="The agent's verifiable on-chain track record"
        >
          <div className="uw-stat">
            <div className="n">{track.evaluated}</div>
            <div className="l">markets priced</div>
          </div>
          <div className="uw-stat">
            <div className="n">{track.accepted}</div>
            <div className="l">accepted</div>
          </div>
          <div className="uw-stat">
            <div className="n">{usd(track.suppliedUsd)}</div>
            <div className="l">supplied on-chain</div>
          </div>
          <div className="uw-stat">
            <div className="n">{track.proofs}</div>
            <div className="l">Walrus proofs</div>
          </div>
        </div>
      )}

      {isLoading && <p className="muted">Loading decisions...</p>}
      {!isLoading && decisions.length === 0 && (
        <p className="muted">
          No decisions yet. Run the agent:{" "}
          <code>cd agent &amp;&amp; npm run once</code> - it publishes here.
        </p>
      )}

      <div className="uw-receipts">
        {decisions.map((d, i) => {
          const probPct = d.input.impliedCrashProb * 100;
          return (
            <article
              className={`uw-receipt ${
                d.decision.accept ? "accepted" : "declined"
              }`}
              key={`${d.timestamp}-${i}`}
            >
              <div className="uw-receipt-head">
                <div>
                  <span>Sui testnet lab</span>
                  <h4>
                    {d.input.symbol} &lt; {usd(d.input.strikeUsd)}
                  </h4>
                  <p>
                    {daysTo(d.input.expiryMs)}d to expiry / reference{" "}
                    {d.input.referencePriceUsd
                      ? usd(d.input.referencePriceUsd)
                      : "unavailable"}
                  </p>
                </div>
                <span
                  className={`pill ${d.decision.accept ? "active" : "settled"}`}
                >
                  {d.decision.accept ? "accept" : "decline"}
                </span>
              </div>

              <div className="uw-probability">
                <div>
                  <span>Market-implied failure risk</span>
                  <strong>{probPct.toFixed(2)}%</strong>
                </div>
                <div className="uw-prob-bar" aria-hidden="true">
                  <span style={{ width: `${Math.min(probPct, 100)}%` }} />
                  <i style={{ left: "25%" }} />
                </div>
                <small>25% acceptance threshold</small>
              </div>

              <div className="uw-receipt-grid">
                <div>
                  <span>Engine</span>
                  <strong>
                    {d.decision.source === "claude" ? "AI review" : "Rules"}
                  </strong>
                </div>
                <div>
                  <span>Capacity</span>
                  <strong>{usd(d.decision.maxCapacityUsd)}</strong>
                </div>
                <div>
                  <span>Premium</span>
                  <strong>{d.decision.premiumBps} bps</strong>
                </div>
                <div>
                  <span>Execution</span>
                  <strong>
                    {d.execution.executed
                      ? usd(d.execution.amountUsd)
                      : d.execution.reason}
                  </strong>
                </div>
              </div>

              <p className="uw-rationale">{d.decision.rationale}</p>

              <div className="uw-links">
                {d.walrusUrl ? (
                  <a
                    className="uw-verify"
                    href={d.walrusUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Walrus proof
                  </a>
                ) : (
                  <span className="muted" style={{ fontSize: 12 }}>
                    Walrus pending
                  </span>
                )}
                {d.execution.executed && (
                  <a
                    className="uw-exec"
                    href={txUrl(d.execution.digest)}
                    target="_blank"
                    rel="noreferrer"
                    title="On-chain supply into the Predict vault"
                  >
                    Sui execution
                  </a>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
