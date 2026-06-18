import { lazy, Suspense, type ReactNode } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { ConnectButton, useCurrentAccount } from "@mysten/dapp-kit";
import Layout from "./components/Layout";
import Landing from "./pages/Landing";

// Route content is lazy-loaded so each page ships as its own chunk - the initial
// bundle stays small (landing + layout + router + wallet core only).
const HowItWorks = lazy(() => import("./pages/HowItWorks"));
const ProofPacket = lazy(() => import("./pages/ProofPacket"));
const SrxIndex = lazy(() => import("./components/SrxIndex"));
const DepegSimulator = lazy(() => import("./components/DepegSimulator"));
const DepegActions = lazy(() => import("./components/DepegActions"));
const DepegProofHealth = lazy(() => import("./components/DepegProofHealth"));
const DepegCover = lazy(() => import("./components/DepegCover"));
const RiskTerminal = lazy(() => import("./components/RiskTerminal"));
const OnchainRiskFeed = lazy(() => import("./components/OnchainRiskFeed"));
const BuyProtection = lazy(() => import("./components/BuyProtection"));
const TreasuryProtect = lazy(() => import("./components/TreasuryProtect"));
const Portfolio = lazy(() => import("./components/Portfolio"));
const Underwrite = lazy(() => import("./components/Underwrite"));
const Underwriter = lazy(() => import("./components/Underwriter"));
const Accountability = lazy(() => import("./components/Accountability"));

function Gate({ label, children }: { label: string; children: ReactNode }) {
  const account = useCurrentAccount();
  if (account) return <>{children}</>;
  return (
    <div className="card connect-prompt">
      <h3>Connect a wallet to {label}</h3>
      <p>
        Sui testnet lab actions use DeepBook Predict research markets. The
        mainnet depeg cover product lives under Cover, and public proof checks
        remain available without a wallet.
      </p>
      <ConnectButton />
    </div>
  );
}

export default function App() {
  return (
    <Suspense
      fallback={
        <div className="card">
          <p className="muted">Loading...</p>
        </div>
      }
    >
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/how-it-works" element={<HowItWorks />} />
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
          <Route path="/proof" element={<ProofPacket />} />
          <Route
            path="/depeg"
            element={
              <>
                <DepegSimulator />
                <DepegActions />
                <DepegProofHealth />
                <DepegCover />
              </>
            }
          />
          <Route path="/insure" element={<Navigate to="/lab/buy" replace />} />
          <Route
            path="/insure/buy"
            element={<Navigate to="/lab/buy" replace />}
          />
          <Route
            path="/insure/treasury"
            element={<Navigate to="/lab/treasury" replace />}
          />
          <Route
            path="/insure/cover"
            element={<Navigate to="/lab/buy" replace />}
          />
          <Route
            path="/insure/policies"
            element={<Navigate to="/lab/policies" replace />}
          />
          <Route
            path="/underwrite"
            element={<Navigate to="/lab/underwrite" replace />}
          />
          <Route path="/lab" element={<Navigate to="/lab/buy" replace />} />
          <Route
            path="/lab/buy"
            element={
              <Gate label="use the Sui testnet lab">
                <BuyProtection />
              </Gate>
            }
          />
          <Route
            path="/lab/treasury"
            element={
              <Gate label="use the Sui testnet lab">
                <TreasuryProtect />
              </Gate>
            }
          />
          <Route
            path="/lab/policies"
            element={
              <Gate label="use the Sui testnet lab">
                <Portfolio />
              </Gate>
            }
          />
          <Route
            path="/lab/underwrite"
            element={
              <Gate label="use the Sui testnet lab">
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
    </Suspense>
  );
}
