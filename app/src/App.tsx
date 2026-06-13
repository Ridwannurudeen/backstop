import { useState } from "react";
import type { ReactNode } from "react";
import { ConnectButton, useCurrentAccount } from "@mysten/dapp-kit";
import SrxIndex from "./components/SrxIndex";
import DepegCover from "./components/DepegCover";
import RiskTerminal from "./components/RiskTerminal";
import OnchainRiskFeed from "./components/OnchainRiskFeed";
import BuyProtection from "./components/BuyProtection";
import TreasuryProtect from "./components/TreasuryProtect";
import CoverPool from "./components/CoverPool";
import Portfolio from "./components/Portfolio";
import Underwrite from "./components/Underwrite";
import Underwriter from "./components/Underwriter";
import Accountability from "./components/Accountability";
import { Logo, SuiDrop } from "./components/Brand";

type TabId =
  | "srx"
  | "terminal"
  | "depeg"
  | "buy"
  | "treasury"
  | "cover"
  | "portfolio"
  | "underwrite"
  | "ai"
  | "accountability";

type Group = {
  id: string;
  label: string;
  wallet: boolean;
  tabs: { id: TabId; label: string }[];
};

const NAV: Group[] = [
  {
    id: "markets",
    label: "Markets",
    wallet: false,
    tabs: [
      { id: "srx", label: "Risk index" },
      { id: "terminal", label: "Risk terminal" },
    ],
  },
  {
    id: "depeg",
    label: "Depeg cover",
    wallet: false,
    tabs: [{ id: "depeg", label: "Depeg cover" }],
  },
  {
    id: "insure",
    label: "Insure",
    wallet: true,
    tabs: [
      { id: "buy", label: "Buy protection" },
      { id: "treasury", label: "Treasury" },
      { id: "cover", label: "Cover pool" },
      { id: "portfolio", label: "My policies" },
    ],
  },
  {
    id: "underwrite",
    label: "Underwrite",
    wallet: true,
    tabs: [{ id: "underwrite", label: "Underwrite" }],
  },
  {
    id: "agent",
    label: "Agent",
    wallet: false,
    tabs: [
      { id: "ai", label: "AI underwriter" },
      { id: "accountability", label: "Accountability" },
    ],
  },
];

const VIEW: Record<TabId, () => ReactNode> = {
  srx: () => <SrxIndex />,
  terminal: () => (
    <>
      <RiskTerminal />
      <OnchainRiskFeed />
    </>
  ),
  depeg: () => <DepegCover />,
  buy: () => <BuyProtection />,
  treasury: () => <TreasuryProtect />,
  cover: () => <CoverPool />,
  portfolio: () => <Portfolio />,
  underwrite: () => <Underwrite />,
  ai: () => <Underwriter />,
  accountability: () => <Accountability />,
};

export default function App() {
  const account = useCurrentAccount();
  const [groupId, setGroupId] = useState("markets");
  const [tabId, setTabId] = useState<TabId>("srx");

  const group = NAV.find((g) => g.id === groupId) ?? NAV[0];
  const needsWallet = group.wallet && !account;

  const selectGroup = (g: Group) => {
    setGroupId(g.id);
    setTabId(g.tabs[0].id);
  };

  return (
    <div className="wrap">
      <header className="site-header">
        <div className="brand">
          <Logo /> Backstop
        </div>
        <nav className="nav">
          {NAV.map((g) => (
            <button
              key={g.id}
              className={g.id === groupId ? "active" : ""}
              onClick={() => selectGroup(g)}
            >
              {g.label}
            </button>
          ))}
        </nav>
        <ConnectButton />
      </header>

      {group.tabs.length > 1 && (
        <div className="subnav">
          {group.tabs.map((t) => (
            <button
              key={t.id}
              className={t.id === tabId ? "active" : ""}
              onClick={() => setTabId(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {needsWallet ? (
        <div className="card connect-prompt">
          <h3>Connect a wallet to {group.label.toLowerCase()}</h3>
          <p>
            These actions run on Sui testnet. The Markets, Depeg cover and Agent
            views are live and read-only — no wallet required.
          </p>
          <ConnectButton />
        </div>
      ) : (
        VIEW[tabId]()
      )}

      <footer className="site-footer">
        <span>The risk &amp; trust layer for Sui.</span>
        <span className="built-on-sui">
          <SuiDrop /> Built on Sui
        </span>
      </footer>
    </div>
  );
}
