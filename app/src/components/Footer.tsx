import { Link } from "react-router-dom";
import { SuiDrop } from "./Brand";

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-left">
        <span className="footer-brand">Backstop</span>
        <span className="footer-tag">The risk &amp; trust layer for Sui.</span>
      </div>
      <nav className="footer-links">
        <Link to="/how-it-works">How it works</Link>
        <Link to="/markets/risk-index">Markets</Link>
        <Link to="/depeg">Depeg cover</Link>
        <Link to="/agent/ai">Agent</Link>
      </nav>
      <span className="built-on-sui">
        <SuiDrop /> Built on Sui
      </span>
    </footer>
  );
}
