import { useCurrentAccount } from "@mysten/dapp-kit";
import { useState } from "react";
import BuyProtection from "./BuyProtection";
import Portfolio from "./Portfolio";
import PublicDepegQuote from "./PublicDepegQuote";
import TreasuryProtect from "./TreasuryProtect";
import Underwrite from "./Underwrite";

type Mode = "buy" | "policies" | "underwrite" | "treasury";

const MODES: { id: Mode; label: string }[] = [
  { id: "buy", label: "Buy mainnet cover" },
  { id: "policies", label: "My policies" },
  { id: "treasury", label: "Insure treasury" },
  { id: "underwrite", label: "LP underwrite" },
];

export default function DepegDesk() {
  const account = useCurrentAccount();
  const [mode, setMode] = useState<Mode>("buy");

  if (!account) {
    return (
      <>
        <PublicDepegQuote />
        <div className="card">
          <h3>Wallet actions</h3>
          <p className="muted">
            Connect a Sui mainnet wallet to buy suiUSDe depeg protection, insure
            a treasury bucket, manage policy objects, or supply liquidity as an
            underwriter.
          </p>
        </div>
      </>
    );
  }

  return (
    <section className="card">
      <div className="desk-head">
        <div>
          <h3>Mainnet depeg protection</h3>
          <p className="muted">
            One product surface for buying cover, managing policy state,
            treasury protection, and LP-style underwriting against the deployed
            Pyth-settled suiUSDe cover pool.
          </p>
        </div>
      </div>

      <div className="depeg-subtabs">
        {MODES.map((m) => (
          <button
            key={m.id}
            className={`btn-sub ${mode === m.id ? "active" : ""}`}
            onClick={() => setMode(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === "buy" && <BuyProtection />}
      {mode === "policies" && <Portfolio />}
      {mode === "treasury" && <TreasuryProtect />}
      {mode === "underwrite" && <Underwrite />}
    </section>
  );
}
