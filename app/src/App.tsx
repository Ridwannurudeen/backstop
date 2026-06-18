import { useEffect, useState } from "react";
import { ConnectButton, useCurrentAccount } from "@mysten/dapp-kit";
import BuildoutCenter from "./components/BuildoutCenter";
import CommandCenter from "./components/CommandCenter";
import DepegDesk from "./components/DepegDesk";
import Home from "./components/Home";
import ProtocolKit from "./components/ProtocolKit";
import ProofCenter from "./components/ProofCenter";
import RiskIndex from "./components/RiskIndex";
import RiskTerminal from "./components/RiskTerminal";
import SuilendCover from "./components/SuilendCover";
import Underwriter from "./components/Underwriter";

type Tab =
  | "home"
  | "submission"
  | "depeg"
  | "terminal"
  | "proof"
  | "protocol"
  | "riskIndex"
  | "suilend"
  | "buildout"
  | "ai";

const TABS: { id: Tab; label: string; path: string }[] = [
  { id: "home", label: "Home", path: "/" },
  { id: "submission", label: "Submission", path: "/submission" },
  { id: "depeg", label: "Cover desk", path: "/depeg" },
  { id: "terminal", label: "DeepBook lab", path: "/terminal" },
  { id: "proof", label: "Proof", path: "/proof" },
  { id: "protocol", label: "Protocol kit", path: "/protocol" },
  { id: "riskIndex", label: "Risk index", path: "/risk-index" },
  { id: "suilend", label: "Suilend pilot", path: "/suilend" },
  { id: "buildout", label: "Buildout", path: "/buildout" },
  { id: "ai", label: "AI underwriter", path: "/agent/ai" },
];

const TAB_BY_PATH = new Map(TABS.map((tab) => [tab.path, tab.id]));
const PATH_BY_TAB = new Map(TABS.map((tab) => [tab.id, tab.path]));

function tabFromPath(pathname: string): Tab {
  return TAB_BY_PATH.get(pathname) ?? "home";
}

export default function App() {
  const account = useCurrentAccount();
  const [tab, setTab] = useState<Tab>(() =>
    typeof window === "undefined"
      ? "home"
      : tabFromPath(window.location.pathname),
  );
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    if (typeof window === "undefined") return "dark";

    const saved = localStorage.getItem("backstop-theme");
    if (saved === "light" || saved === "dark") return saved;

    const prefersLight =
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: light)").matches;
    return prefersLight ? "light" : "dark";
  });

  const visibleTabs = TABS;
  const active = tab;

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("backstop-theme", theme);
  }, [theme]);

  useEffect(() => {
    const onPopState = () => setTab(tabFromPath(window.location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function selectTab(next: Tab) {
    setTab(next);
    const path = PATH_BY_TAB.get(next) ?? "/";
    if (window.location.pathname !== path) {
      window.history.pushState({}, "", path);
    }
  }

  function toggleTheme() {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }

  return (
    <div className="wrap">
      <header className="top">
        <div>
          <div className="brand">
            Back<span>stop</span>
          </div>
          <div className="tagline">
            The DeepBook-priced cover desk for Sui DeFi.
          </div>
        </div>
        <div className="top-controls">
          <button
            className="theme-switch"
            type="button"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
          <ConnectButton />
        </div>
      </header>

      <div className="tabs">
        {visibleTabs.map((t) => (
          <button
            key={t.id}
            className={`tab ${active === t.id ? "active" : ""}`}
            onClick={() => selectTab(t.id)}
            type="button"
          >
            {t.label}
          </button>
        ))}
      </div>

      {!account && tab === "depeg" && (
        <div className="card">
          <p className="muted">
            Connect a Sui mainnet wallet to buy cover, manage policies, insure a
            treasury bucket, or supply pool liquidity. Proof, protocol, and risk
            surfaces are public.
          </p>
        </div>
      )}

      {active === "home" && (
        <Home
          onOpenDepeg={() => selectTab("depeg")}
          onOpenProof={() => selectTab("proof")}
        />
      )}
      {active === "submission" && <CommandCenter />}
      {active === "depeg" && <DepegDesk />}
      {active === "terminal" && <RiskTerminal />}
      {active === "proof" && <ProofCenter />}
      {active === "protocol" && <ProtocolKit />}
      {active === "riskIndex" && <RiskIndex />}
      {active === "suilend" && <SuilendCover />}
      {active === "buildout" && <BuildoutCenter />}
      {active === "ai" && <Underwriter />}
    </div>
  );
}
