import { useState } from "react";
import { ConnectButton, useCurrentAccount } from "@mysten/dapp-kit";
import BuyProtection from "./components/BuyProtection";
import TreasuryProtect from "./components/TreasuryProtect";
import Portfolio from "./components/Portfolio";
import Underwrite from "./components/Underwrite";
import RiskTerminal from "./components/RiskTerminal";
import Underwriter from "./components/Underwriter";
import OnchainRiskFeed from "./components/OnchainRiskFeed";

type Tab = "buy" | "treasury" | "portfolio" | "underwrite" | "terminal" | "ai";

const TABS: { id: Tab; label: string; needsWallet: boolean }[] = [
  { id: "buy", label: "Buy protection", needsWallet: true },
  { id: "treasury", label: "Insure my treasury", needsWallet: true },
  { id: "portfolio", label: "My policies", needsWallet: true },
  { id: "underwrite", label: "Underwrite", needsWallet: true },
  { id: "terminal", label: "Risk terminal", needsWallet: false },
  { id: "ai", label: "AI underwriter", needsWallet: false },
];

export default function App() {
  const account = useCurrentAccount();
  const [tab, setTab] = useState<Tab>("buy");

  // Risk terminal is public (read-only); everything else needs a wallet.
  const visibleTabs = account ? TABS : TABS.filter((t) => !t.needsWallet);
  const active =
    account || !TABS.find((t) => t.id === tab)?.needsWallet ? tab : "terminal";

  return (
    <div className="wrap">
      <header className="top">
        <div>
          <div className="brand">
            Back<span>stop</span>
          </div>
          <div className="tagline">
            Crash insurance for crypto, settled in 400ms on DeepBook Predict
          </div>
        </div>
        <ConnectButton />
      </header>

      <div className="tabs">
        {visibleTabs.map((t) => (
          <button
            key={t.id}
            className={`tab ${active === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!account && (
        <div className="card">
          <p className="muted">
            Connect a Sui wallet (testnet) to buy protection, insure a treasury,
            or underwrite. The risk terminal below is live and read-only — no
            wallet required.
          </p>
        </div>
      )}

      {active === "buy" && <BuyProtection />}
      {active === "treasury" && <TreasuryProtect />}
      {active === "portfolio" && <Portfolio />}
      {active === "underwrite" && <Underwrite />}
      {active === "terminal" && (
        <>
          <RiskTerminal />
          <OnchainRiskFeed />
        </>
      )}
      {active === "ai" && <Underwriter />}
    </div>
  );
}
