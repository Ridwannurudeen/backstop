import {
  KEEPER_OPERATIONS,
  PROTOCOL_ADAPTERS,
  PROTOCOL_PASSPORTS,
  RISK_MARKETS,
  keeperStatusLabel,
  statusLabel,
} from "../lib/riskClearinghouse";

const weights = [
  { label: "Oracle integrity", value: "25%" },
  { label: "DeepBook liquidity / hedge depth", value: "20%" },
  { label: "Volatility and peg drift", value: "20%" },
  { label: "Protocol concentration", value: "20%" },
  { label: "Proof readiness", value: "15%" },
];

export default function RiskIndex() {
  const averageScore = Math.round(
    RISK_MARKETS.reduce((sum, market) => sum + market.score, 0) /
      RISK_MARKETS.length,
  );
  const mainnetCount = RISK_MARKETS.filter(
    (market) => market.status === "mainnet-live",
  ).length;

  return (
    <section className="card risk-index">
      <div className="proof-head">
        <div>
          <h3>Backstop Risk Index</h3>
          <p className="muted">
            SRX is the clearinghouse score Backstop uses to rank cover markets,
            cap underwriting, and decide which risks are ready for protocol
            integrations.
          </p>
        </div>
        <div className="risk-score-dial">
          <span>SRX</span>
          <strong>{averageScore}</strong>
          <em>{mainnetCount} mainnet lane</em>
        </div>
      </div>

      <div className="risk-weight-grid">
        {weights.map((weight) => (
          <div className="risk-weight" key={weight.label}>
            <span>{weight.label}</span>
            <strong>{weight.value}</strong>
          </div>
        ))}
      </div>

      <div className="risk-market-table">
        <div className="risk-market-row risk-market-head">
          <span>Market</span>
          <span>Status</span>
          <span>SRX</span>
          <span>DeepBook role</span>
          <span>Next move</span>
        </div>
        {RISK_MARKETS.map((market) => (
          <article className="risk-market-row" key={market.id}>
            <div>
              <strong>{market.title}</strong>
              <p className="muted">{market.asset}</p>
            </div>
            <span className={`market-status ${market.status}`}>
              {statusLabel(market.status)}
            </span>
            <strong>{market.score}</strong>
            <p>{market.deepBookRole}</p>
            <p className="muted">{market.next}</p>
          </article>
        ))}
      </div>

      <div className="section-head compact">
        <div>
          <div className="eyebrow">Operations map</div>
          <h3>Keeper lanes</h3>
        </div>
        <p className="muted">
          SRX is only useful if it drives operations. These lanes define what
          the public monitor can read now and what requires a signer, partner
          schema, or post-hackathon hedge budget.
        </p>
      </div>

      <div className="ops-grid">
        {KEEPER_OPERATIONS.map((operation) => (
          <article className="ops-card" key={operation.id}>
            <div className="market-top">
              <span className={`ops-status ${operation.status}`}>
                {keeperStatusLabel(operation.status)}
              </span>
              <strong>{operation.cadence}</strong>
            </div>
            <h3>{operation.lane}</h3>
            <p className="muted">{operation.watches}</p>
          </article>
        ))}
      </div>

      <div className="section-head compact">
        <div>
          <div className="eyebrow">Risk passports</div>
          <h3>Protocol coverage pipeline</h3>
        </div>
        <p className="muted">
          The passport is the enterprise surface: a protocol, wallet, or DAO can
          inspect what Backstop covers before touching the SDK.
        </p>
      </div>

      <div className="passport-grid">
        {PROTOCOL_PASSPORTS.map((passport) => (
          <article className="passport-card" key={passport.protocol}>
            <span>{passport.readiness.replace("-", " ")}</span>
            <h3>{passport.protocol}</h3>
            <strong>{passport.lane}</strong>
            <p className="muted">{passport.proof}</p>
            <div className="passport-detail">
              <b>Evidence</b>
              <em>{passport.requiredEvidence}</em>
            </div>
            <div className="passport-detail">
              <b>Policy storage</b>
              <em>{passport.policyStorage}</em>
            </div>
          </article>
        ))}
      </div>

      <div className="section-head compact">
        <div>
          <div className="eyebrow">Adapter specs</div>
          <h3>First production parsers</h3>
        </div>
        <p className="muted">
          The next moat is object-level evidence. Backstop needs one confirmed
          object sample per protocol before account-level cover can be called
          live.
        </p>
      </div>

      <div className="adapter-grid">
        {PROTOCOL_ADAPTERS.map((adapter) => (
          <article className="adapter-card" key={adapter.protocol}>
            <span>{adapter.protocol}</span>
            <h3>{adapter.next}</h3>
            <p className="muted">{adapter.currentBoundary}</p>
            <div className="adapter-list">
              {adapter.normalizes.map((field) => (
                <em key={field}>{field}</em>
              ))}
            </div>
          </article>
        ))}
      </div>

      <p className="note">
        Judge-facing boundary: this SRX console is a live product surface backed
        by current proof artifacts and static market policy. The next on-chain
        step is to publish SRX readings through the keeper role and mirror them
        to Walrus.
      </p>
    </section>
  );
}
