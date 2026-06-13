import { Link } from "react-router-dom";
import { Logo, SuiDrop } from "../components/Brand";

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
    icon: <IconFeed />,
    title: "On-chain risk oracle",
    body: "A market-implied probability-of-failure feed any Sui contract can read — bonded, challengeable, and Walrus-proven.",
  },
  {
    icon: <IconShield />,
    title: "Parametric cover",
    body: "Crash and stablecoin-depeg cover from a fully-collateralized pool: LPs underwrite, policies pay straight from the pool.",
  },
  {
    icon: <IconCheck />,
    title: "Trustless settlement",
    body: "Claims settle against Pyth on-chain with a freshness bound — no one has to trust Backstop to get paid.",
  },
  {
    icon: <IconAgent />,
    title: "Autonomous underwriter",
    body: "A bonded agent prices and underwrites on-chain, logging every decision to Walrus — reputation earned, not asserted.",
  },
];

export default function Landing() {
  return (
    <div className="landing">
      <header className="landing-nav">
        <Link to="/" className="brand">
          <Logo /> Backstop
        </Link>
        <nav className="landing-links">
          <Link to="/markets/risk-index">Markets</Link>
          <Link to="/depeg">Depeg cover</Link>
          <Link to="/agent/ai">Agent</Link>
        </nav>
        <Link to="/depeg" className="btn-sm">
          Launch app
        </Link>
      </header>

      <section className="hero">
        <div className="hero-badge">
          <SuiDrop /> Built on Sui · Overflow 2026
        </div>
        <h1>
          Price, transfer, and prove
          <br />
          risk on Sui.
        </h1>
        <p>
          Backstop is the risk &amp; trust layer for Sui — an on-chain
          probability-of-failure oracle, parametric crash and depeg cover
          settled trustlessly by Pyth, and a bonded autonomous underwriter.
        </p>
        <div className="hero-cta">
          <Link to="/depeg" className="btn">
            Launch app
          </Link>
          <Link to="/markets/risk-index" className="btn ghost">
            Explore the risk index
          </Link>
        </div>
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

      <footer className="site-footer">
        <span>The risk &amp; trust layer for Sui.</span>
        <span className="built-on-sui">
          <SuiDrop /> Built on Sui
        </span>
      </footer>
    </div>
  );
}
