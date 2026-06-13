import { Link } from "react-router-dom";
import { Logo } from "./Brand";

export default function MarketingNav() {
  return (
    <header className="landing-nav">
      <Link to="/" className="brand">
        <Logo /> Backstop
      </Link>
      <nav className="landing-links">
        <Link to="/how-it-works">How it works</Link>
        <Link to="/markets/risk-index">Markets</Link>
        <Link to="/depeg">Depeg cover</Link>
        <Link to="/agent/ai">Agent</Link>
      </nav>
      <Link to="/depeg" className="btn-sm">
        Launch app
      </Link>
    </header>
  );
}
