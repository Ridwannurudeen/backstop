import {
  HEDGE_ROUTER_MODULES,
  LP_VAULT_BLUEPRINTS,
  REPORT_PRODUCTS,
  REPUTATION_SIGNALS,
  WALLET_WARNING_RULES,
} from "../lib/riskClearinghouse";
import WalletRiskWidget from "./WalletRiskWidget";

function statusClass(status: string) {
  return status.replace("-", "_");
}

export default function BuildoutCenter() {
  return (
    <section className="card buildout-center">
      <div className="proof-head">
        <div>
          <div className="eyebrow">Infinite buildout</div>
          <h3>Everything left from the audit, turned into modules</h3>
          <p className="muted">
            This is the product architecture beyond the hackathon: vaults,
            keepers, wallet warnings, reports, adapter probes, reputation, and a
            DeepBook hedge router. Items with external dependencies are marked
            honestly instead of faked.
          </p>
        </div>
        <div className="proof-pill">Mainnet lane first</div>
      </div>

      <div className="section-head compact">
        <div>
          <div className="eyebrow">Risk-class LP vaults</div>
          <h3>Underwriting products</h3>
        </div>
        <p className="muted">
          Vaults split capital by risk instead of mixing every liability into a
          generic pool.
        </p>
      </div>

      <div className="buildout-grid">
        {LP_VAULT_BLUEPRINTS.map((vault) => (
          <article className="buildout-card" key={vault.name}>
            <span className={`build-status ${statusClass(vault.status)}`}>
              {vault.status.replace("-", " ")}
            </span>
            <h3>{vault.name}</h3>
            <strong>{vault.riskClass}</strong>
            <p className="muted">{vault.gatingRule}</p>
            <div className="passport-detail">
              <b>Accepts</b>
              <em>{vault.accepts}</em>
            </div>
            <div className="passport-detail">
              <b>Markets</b>
              <em>{vault.coverMarkets}</em>
            </div>
          </article>
        ))}
      </div>

      <div className="section-head compact">
        <div>
          <div className="eyebrow">DeepBook hedge router</div>
          <h3>Capacity and hedge modules</h3>
        </div>
      </div>

      <div className="buildout-grid">
        {HEDGE_ROUTER_MODULES.map((module) => (
          <article className="buildout-card" key={module.name}>
            <span className={`build-status ${statusClass(module.status)}`}>
              {module.status.replace("-", " ")}
            </span>
            <h3>{module.name}</h3>
            <p className="muted">{module.signal}</p>
            <div className="passport-detail">
              <b>Decision</b>
              <em>{module.decision}</em>
            </div>
            <div className="passport-detail">
              <b>Output</b>
              <em>{module.output}</em>
            </div>
          </article>
        ))}
      </div>

      <div className="section-head compact">
        <div>
          <div className="eyebrow">Wallet risk widget</div>
          <h3>Covered / uncovered routing</h3>
        </div>
        <p className="muted">
          The widget is functional now for wallet balances. Protocol positions
          become richer once NAVI/Suilend object parsers are approved.
        </p>
      </div>

      <WalletRiskWidget />

      <div className="buildout-grid">
        {WALLET_WARNING_RULES.map((rule) => (
          <article className="buildout-card" key={rule.id}>
            <span className={`build-status ${statusClass(rule.status)}`}>
              {rule.status.replace("-", " ")}
            </span>
            <h3>{rule.label}</h3>
            <p className="muted">{rule.risk}</p>
            <div className="passport-detail">
              <b>Match</b>
              <em>{rule.match}</em>
            </div>
            <div className="passport-detail">
              <b>Action</b>
              <em>{rule.action}</em>
            </div>
          </article>
        ))}
      </div>

      <div className="section-head compact">
        <div>
          <div className="eyebrow">Reports and reputation</div>
          <h3>Institutional proof layer</h3>
        </div>
      </div>

      <div className="buildout-grid">
        {REPORT_PRODUCTS.map((report) => (
          <article className="buildout-card" key={report.name}>
            <span className={`build-status ${statusClass(report.status)}`}>
              {report.status.replace("-", " ")}
            </span>
            <h3>{report.name}</h3>
            <p className="muted">{report.audience}</p>
            <div className="passport-detail">
              <b>Source</b>
              <em>{report.source}</em>
            </div>
            <div className="passport-detail">
              <b>Output</b>
              <em>{report.output}</em>
            </div>
          </article>
        ))}
      </div>

      <div className="buildout-grid">
        {REPUTATION_SIGNALS.map((signal) => (
          <article className="buildout-card" key={signal.name}>
            <span className={`build-status ${statusClass(signal.status)}`}>
              {signal.status.replace("-", " ")}
            </span>
            <h3>{signal.name}</h3>
            <p className="muted">{signal.subject}</p>
            <div className="passport-detail">
              <b>Positive</b>
              <em>{signal.positiveEvent}</em>
            </div>
            <div className="passport-detail">
              <b>Negative</b>
              <em>{signal.negativeEvent}</em>
            </div>
            <div className="passport-detail">
              <b>Proof</b>
              <em>{signal.proof}</em>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
