import { Link } from "react-router-dom";
import MarketingNav from "../components/MarketingNav";
import Footer from "../components/Footer";

export default function HowItWorks() {
  return (
    <div className="landing">
      <MarketingNav />

      <article className="doc">
        <header className="doc-head">
          <h1>How Backstop works</h1>
          <p>
            Backstop's shipped product is mainnet depeg cover. DeepBook Predict,
            Walrus, SRX, and the agent modules are the risk-oracle and
            accountability research layer behind that wedge.
          </p>
        </header>

        <section>
          <h2>The problem</h2>
          <p>
            When the $223M Cetus exploit hit Sui in 2025, the "insurance" was a
            90.9% validator vote to freeze and roll back the chain -
            governance-by-emergency, not a primitive. Backstop starts with depeg
            risk because it has objective oracle settlement and obvious protocol
            demand.
          </p>
        </section>

        <section>
          <h2>1. Size the exposure</h2>
          <p>
            The Cover page can scan or import NAVI/Suilend-like position
            objects, estimate USDe-family exposure, convert that exposure into a
            SUI-denominated cover size, and apply the pool's current headroom
            and per-policy caps.
          </p>
        </section>

        <section>
          <h2>2. Transfer depeg risk</h2>
          <p>
            Holders buy parametric cover from a fully-collateralized pool for
            stablecoin-depeg risk, such as suiUSDe below $0.985. LPs supply SUI
            capital and earn premiums. The pool can pay every outstanding policy
            in its payout asset, while users should still understand the USD/SUI
            basis risk.
          </p>
        </section>

        <section>
          <h2>3. Settle objectively</h2>
          <p>
            A claim reads Pyth on-chain with a freshness bound and pays from the
            pool only after the adverse price band stays below the floor through
            the dwell window. No claims committee decides a payout. Pricing is
            subjective and pool-defined; settlement conditions are objective and
            on-chain.
          </p>
        </section>

        <section>
          <h2>Risk-oracle research layer</h2>
          <p>
            Backstop also ships DeepBook Predict testnet primitives: SRX, a
            RiskFeed, Walrus-anchored agent decisions, and calibration/arena
            objects. Those prove the direction, but their disputes are still
            admin-resolved today. They are not yet a fully trustless production
            risk oracle.
          </p>
        </section>

        <section>
          <h2>What's live vs. roadmap</h2>
          <ul className="doc-list">
            <li>
              <b>Live on mainnet:</b> Pyth-settled stablecoin-depeg cover: the
              v4 package, low-cap production pool, wallet actions,
              duration-priced economics, permissionless expiry sweep, pool-level
              depeg epochs, fresh Pyth sale checks, proof-health checks, and
              archived staged mechanism-test claim evidence are recorded on Sui
              mainnet.
            </li>
            <li>
              <b>Live on testnet:</b> the RiskFeed + SRX index, autonomous
              underwriter, calibration ledger and agent arena, deployed as
              risk-oracle/accountability proofs over DeepBook Predict.
            </li>
            <li>
              <b>Roadmap:</b> protocol integrations, multi-asset markets,
              stable-collateral or oracle-haircut accounting, and a
              trust-minimized dispute game.
            </li>
          </ul>
        </section>

        <div className="doc-cta">
          <Link to="/depeg" className="btn">
            Launch app
          </Link>
          <Link to="/markets/risk-index" className="btn ghost">
            Explore the risk feed
          </Link>
          <Link to="/proof" className="btn ghost">
            Open proof packet
          </Link>
        </div>
      </article>

      <Footer />
    </div>
  );
}
