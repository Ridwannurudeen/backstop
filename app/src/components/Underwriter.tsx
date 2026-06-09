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
      <h3>Autonomous AI underwriter</h3>
      <p className="muted">
        The agent reads DeepBook Predict's on-chain volatility surface, turns it
        into a market-implied <b>probability of failure</b>, prices capacity +
        premium, and logs every decision to Walrus — independently verifiable.{" "}
        {data && (
          <span>· last run {new Date(data.generatedAt).toLocaleString()}</span>
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
            <div className="l">underwritten</div>
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

      {isLoading && <p className="muted">Loading decisions…</p>}
      {!isLoading && decisions.length === 0 && (
        <p className="muted">
          No decisions yet. Run the agent:{" "}
          <code>cd agent &amp;&amp; npm run once</code> — it publishes here.
        </p>
      )}

      {decisions.map((d, i) => {
        const probPct = d.input.impliedCrashProb * 100;
        return (
          <div className="uw-row" key={i}>
            <div className="uw-main">
              <div className="uw-market">
                {d.input.symbol} &lt; {usd(d.input.strikeUsd)}{" "}
                <span className="muted">
                  · {daysTo(d.input.expiryMs)}d · ref{" "}
                  {d.input.referencePriceUsd
                    ? usd(d.input.referencePriceUsd)
                    : "—"}
                </span>
              </div>
              <div className="uw-prob">
                <span className="uw-prob-v">{probPct.toFixed(2)}%</span>
                <span className="muted"> implied crash prob</span>
              </div>
              <div className="uw-rationale muted">{d.decision.rationale}</div>
            </div>

            <div className="uw-side">
              <span
                className={`pill ${d.decision.accept ? "active" : "settled"}`}
              >
                {d.decision.accept ? "underwrite" : "decline"}
              </span>
              <span className={`uw-src ${d.decision.source}`}>
                {d.decision.source === "claude" ? "AI" : "rules"}
              </span>
              <div className="uw-terms">
                <div>
                  <span className="muted">capacity </span>
                  {usd(d.decision.maxCapacityUsd)}
                </div>
                <div>
                  <span className="muted">premium </span>
                  {d.decision.premiumBps} bps
                </div>
              </div>
              {d.walrusUrl ? (
                <a
                  className="uw-verify"
                  href={d.walrusUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Verify on Walrus ↗
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
                  ⚡ supplied {usd(d.execution.amountUsd)} on-chain ↗
                </a>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
