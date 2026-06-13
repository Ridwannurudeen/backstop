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
            Backstop turns Sui's on-chain markets into a way to price, transfer,
            and prove risk — the layer the ecosystem is missing.
          </p>
        </header>

        <section>
          <h2>The problem</h2>
          <p>
            When the $223M Cetus exploit hit Sui in 2025, the "insurance" was a
            90.9% validator vote to freeze and roll back the chain —
            governance-by-emergency, not a primitive. Less than 2% of DeFi is
            insured, and Sui has no native way to price or transfer the risk
            that actually wipes people out: a crash or a depeg. Backstop is that
            missing layer.
          </p>
        </section>

        <section>
          <h2>1 · Price the risk</h2>
          <p>
            Backstop reads DeepBook Predict's on-chain volatility surface and
            turns each market's binary-option price into a market-implied{" "}
            <b>probability of failure</b>. That becomes the <b>RiskFeed</b> — a
            bonded, challengeable, on-chain oracle any Sui contract can read,
            with every reading's inputs anchored to Walrus. The <b>SRX index</b>{" "}
            (CRASH / VOL / TAIL) is the headline read of that surface across a
            strike grid.
          </p>
        </section>

        <section>
          <h2>2 · Transfer the risk</h2>
          <p>
            Holders buy <b>parametric cover</b> from a fully-collateralized pool
            — crash cover on a treasury, or stablecoin-depeg cover (e.g. suiUSDe
            below $0.97). LPs supply capital and earn premiums, priced off the
            live feed. The pool is always fully collateralized: it can pay every
            outstanding policy at all times.
          </p>
        </section>

        <section>
          <h2>3 · Settle trustlessly</h2>
          <p>
            On the mainnet path, a claim reads <b>Pyth</b> on-chain with a
            freshness bound and pays straight from the pool the moment the
            insured asset breaks its floor. No claims process, no trust in
            Backstop — the payout depends only on a neutral oracle. Pricing is
            subjective and off-chain; settlement is objective and on-chain.
          </p>
        </section>

        <section>
          <h2>Verifiable, not asserted</h2>
          <p>
            A bonded autonomous <b>underwriter</b> prices and underwrites
            on-chain, logging every decision and its realized outcome to Walrus.
            Trust is earned on a public calibration ledger anyone can replay,
            not self-reported. Competing agents bond capital and are slashed
            when their on-chain accuracy falls below threshold.
          </p>
        </section>

        <section>
          <h2>What's live vs. roadmap</h2>
          <ul className="doc-list">
            <li>
              <b>Live on testnet:</b> the RiskFeed + SRX index, the parametric
              cover pool, the autonomous underwriter, the calibration ledger and
              agent arena — deployed and proven over DeepBook Predict.
            </li>
            <li>
              <b>Built, mainnet-proven, deploy-pending:</b> Pyth-settled
              stablecoin-depeg cover — the settlement read is proven live on Sui
              mainnet; the pool deploy is the one remaining funded step.
            </li>
            <li>
              <b>Roadmap:</b> multi-asset markets, an underwriter marketplace,
              and a generalized provenance standard.
            </li>
          </ul>
        </section>

        <div className="doc-cta">
          <Link to="/depeg" className="btn">
            Launch app
          </Link>
          <Link to="/markets/risk-index" className="btn ghost">
            Explore the risk index
          </Link>
        </div>
      </article>

      <Footer />
    </div>
  );
}
