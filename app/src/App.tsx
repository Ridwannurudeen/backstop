import type { ReactNode } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { ConnectButton, useCurrentAccount } from "@mysten/dapp-kit";
import Layout from "./components/Layout";
import Landing from "./pages/Landing";
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

function Gate({ label, children }: { label: string; children: ReactNode }) {
  const account = useCurrentAccount();
  if (account) return <>{children}</>;
  return (
    <div className="card connect-prompt">
      <h3>Connect a wallet to {label}</h3>
      <p>
        These actions run on Sui testnet. The Markets, Depeg cover and Agent
        pages are live and read-only — no wallet required.
      </p>
      <ConnectButton />
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route element={<Layout />}>
        <Route
          path="/markets"
          element={<Navigate to="/markets/risk-index" replace />}
        />
        <Route path="/markets/risk-index" element={<SrxIndex />} />
        <Route
          path="/markets/risk-terminal"
          element={
            <>
              <RiskTerminal />
              <OnchainRiskFeed />
            </>
          }
        />
        <Route path="/depeg" element={<DepegCover />} />
        <Route path="/insure" element={<Navigate to="/insure/buy" replace />} />
        <Route
          path="/insure/buy"
          element={
            <Gate label="buy protection">
              <BuyProtection />
            </Gate>
          }
        />
        <Route
          path="/insure/treasury"
          element={
            <Gate label="insure a treasury">
              <TreasuryProtect />
            </Gate>
          }
        />
        <Route
          path="/insure/cover"
          element={
            <Gate label="use the cover pool">
              <CoverPool />
            </Gate>
          }
        />
        <Route
          path="/insure/policies"
          element={
            <Gate label="view your policies">
              <Portfolio />
            </Gate>
          }
        />
        <Route
          path="/underwrite"
          element={
            <Gate label="underwrite">
              <Underwrite />
            </Gate>
          }
        />
        <Route path="/agent" element={<Navigate to="/agent/ai" replace />} />
        <Route path="/agent/ai" element={<Underwriter />} />
        <Route path="/agent/accountability" element={<Accountability />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
