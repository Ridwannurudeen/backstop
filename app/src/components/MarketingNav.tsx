import { Link } from "react-router-dom";
import { Logo } from "./Brand";
import ThemeToggle from "./ThemeToggle";

export default function MarketingNav() {
  return (
    <header className="landing-nav">
      <Link to="/" className="brand">
        <Logo /> Backstop
      </Link>
      <nav className="landing-links">
        <Link to="/how-it-works">How it works</Link>
        <Link to="/depeg#safe-pay">SafePay</Link>
        <Link to="/proof">Proof</Link>
        <Link to="/agent/ai">Agent Proofs</Link>
      </nav>
      <div className="landing-actions">
        <ThemeToggle />
        <Link to="/depeg#safe-pay" className="btn-sm">
          Launch app
        </Link>
      </div>
    </header>
  );
}
