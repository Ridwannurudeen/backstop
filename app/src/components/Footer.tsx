import { Link } from "react-router-dom";
import { SuiDrop } from "./Brand";

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-left">
        <span className="footer-brand">Backstop</span>
        <span className="footer-tag">Protected payments for Sui DeFi.</span>
      </div>
      <nav className="footer-links">
        <Link to="/how-it-works">How it works</Link>
        <Link to="/depeg#safe-pay">SafePay</Link>
        <Link to="/proof">Proof</Link>
        <Link to="/agent/ai">Agent</Link>
        <Link to="/lab/buy">Testnet lab</Link>
      </nav>
      <span className="built-on-sui">
        <SuiDrop /> Built on Sui
      </span>
    </footer>
  );
}
