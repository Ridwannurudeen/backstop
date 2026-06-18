import "./terminal.css";

export default function CoverPool() {
  return (
    <div className="card">
      <h3>Legacy cover pool - disabled research lane</h3>
      <p className="lead">
        This RiskFeed-settled testnet cover pool is not production-safe and is
        no longer exposed in Backstop's app navigation.
      </p>
      <p className="muted">
        Use the Cover tab for the mainnet Pyth-settled depeg pool. The legacy
        lane remains in the repo only for audits and follow-on hardening.
      </p>
    </div>
  );
}
