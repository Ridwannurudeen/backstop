import { lazy, Suspense, type ReactNode } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { ConnectButton, useCurrentAccount } from "@mysten/dapp-kit";
import Layout from "./components/Layout";
import Landing from "./pages/Landing";

// Route content is lazy-loaded so each page ships as its own chunk — the initial
// bundle stays small (landing + layout + router + wallet core only).
const HowItWorks = lazy(() => import("./pages/HowItWorks"));
const SrxIndex = lazy(() => import("./components/SrxIndex"));
const DepegSimulator = lazy(() => import("./components/DepegSimulator"));
const DepegActions = lazy(() => import("./components/DepegActions"));
const DepegCover = lazy(() => import("./components/DepegCover"));
const RiskTerminal = lazy(() => import("./components/RiskTerminal"));
const OnchainRiskFeed = lazy(() => import("./components/OnchainRiskFeed"));
const BuyProtection = lazy(() => import("./components/BuyProtection"));
const TreasuryProtect = lazy(() => import("./components/TreasuryProtect"));
const CoverPool = lazy(() => import("./components/CoverPool"));
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
        These actions run on Sui testnet. The Markets, Depeg cover and Agent
        pages are live and read-only — no wallet required.
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
          <p className="muted">Loading…</p>
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
          <Route
            path="/depeg"
            element={
              <>
                <DepegSimulator />
                <DepegActions />
                <DepegCover />
              </>
            }
          />
          <Route
            path="/insure"
            element={<Navigate to="/insure/buy" replace />}
          />
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
    </Suspense>
  );
}
