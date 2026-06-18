import { Link } from "react-router-dom";
import { SuiDrop } from "../components/Brand";
import MarketingNav from "../components/MarketingNav";
import Footer from "../components/Footer";
import LiveStats from "../components/LiveStats";

const stroke = {
  fill: "none" as const,
  stroke: "var(--sui)",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const IconFeed = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}>
    <path d="M3 16l4-7 4 4 3-6 4 9" />
    <path d="M3 20h18" opacity="0.5" />
  </svg>
);
const IconShield = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}>
    <path d="M12 3 5 5.5v6c0 4 2.8 6.8 7 8.3 4.2-1.5 7-4.3 7-8.3v-6L12 3Z" />
    <path d="M9 12l2.2 2.2L15.5 9.5" />
  </svg>
);
const IconCheck = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M8.5 12.2 11 14.7l4.6-5.2" />
  </svg>
);
const IconAgent = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}>
    <rect x="6" y="6" width="12" height="12" rx="3" />
    <path d="M12 3v3M12 18v3M3 12h3M18 12h3" opacity="0.6" />
    <circle cx="12" cy="12" r="2.2" />
  </svg>
);

const FEATURES = [
  {
    icon: <IconShield />,
    title: "Mainnet depeg cover",
    body: "SUI-collateralized suiUSDe cover from a fully-collateralized pool. LPs underwrite; eligible policies claim from the pool.",
  },
  {
    icon: <IconCheck />,
    title: "Objective settlement",
    body: "Payout conditions are checked on-chain against Pyth with freshness, confidence-band, activation-delay, and dwell requirements.",
  },
  {
    icon: <IconFeed />,
    title: "Risk oracle lineage",
    body: "DeepBook Predict powers the testnet risk-feed and SRX surfaces; the production depeg product settles on Pyth today.",
  },
  {
    icon: <IconAgent />,
    title: "Agent proof layer",
    body: "Agent, calibration, and arena modules are live accountability proofs, not yet a fully trustless production dispute system.",
  },
];

const STEPS = [
  {
    n: "1",
    title: "Detect exposure",
    body: "Scan or import a NAVI/Suilend-like position and size USDe-family exposure into a SUI-denominated cover amount.",
  },
  {
    n: "2",
    title: "Buy cover",
    body: "Buy mainnet depeg cover from the production pool using live capacity, headroom, and premium quotes.",
  },
  {
    n: "3",
    title: "Claim on breach",
    body: "If Pyth's adverse band stays below the floor through the dwell window, the policy latches and can claim from the pool.",
  },
];

export default function Landing() {
  return (
    <div className="landing">
      <MarketingNav />

      <section className="hero">
        <div className="hero-badge">
          <SuiDrop /> Built on Sui - Overflow 2026
        </div>
        <h1>
          Depeg cover for
          <br />
          Sui DeFi.
        </h1>
        <p>
          Backstop protects Sui DeFi from depeg and bad-debt cascades before
          emergency validator intervention is the only option: mainnet
          Pyth-settled depeg cover now, with DeepBook/Walrus risk-oracle
          primitives as the research layer.
        </p>
        <div className="hero-cta">
          <Link to="/depeg" className="btn">
            Launch app
          </Link>
          <Link to="/how-it-works" className="btn ghost">
            How it works
          </Link>
        </div>
        <LiveStats />
      </section>

      <section className="band">
        <h2>Sui's only backstop today is a validator bailout.</h2>
        <p>
          When the $223M Cetus exploit hit in 2025, the "insurance" was a 90.9%
          validator vote to roll back the chain - governance-by-emergency, not a
          primitive. Backstop starts narrower: production-shaped depeg cover,
          priced by pool terms, settled objectively against Pyth, and exposed
          through a wallet-connected app.
        </p>
      </section>

      <section className="steps">
        {STEPS.map((s) => (
          <div className="step" key={s.n}>
            <div className="step-n">{s.n}</div>
            <h3>{s.title}</h3>
            <p>{s.body}</p>
          </div>
        ))}
      </section>

      <section className="features">
        {FEATURES.map((f) => (
          <article className="feature" key={f.title}>
            <div className="feature-ic">{f.icon}</div>
            <h3>{f.title}</h3>
            <p>{f.body}</p>
          </article>
        ))}
      </section>

      <section className="closing">
        <h2>Protect depeg exposure on Sui.</h2>
        <div className="hero-cta">
          <Link to="/depeg" className="btn">
            Launch app
          </Link>
          <Link to="/markets/risk-index" className="btn ghost">
            Explore the risk feed
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
