import { useEffect, useMemo, useState } from "react";
import { txUrl } from "../lib/format";
import {
  MAINNET_DEPEG_PROOF_PACK,
  TESTNET_PROOF_PACK,
} from "../lib/proofData";
import {
  CLEARINGHOUSE_METRICS,
  PROTOCOL_PASSPORTS,
  RISK_MARKETS,
  statusLabel,
} from "../lib/riskClearinghouse";

type LifecycleStep = {
  state: "active" | "dwell" | "settle" | "paid";
  title: string;
  note: string;
};

const STEPS: LifecycleStep[] = [
  { state: "active", title: "Active", note: "Coverage is funded and tradable." },
  {
    state: "dwell",
    title: "Breach observed",
    note: "Oracle crosses the policy floor.",
  },
  {
    state: "settle",
    title: "Dwell complete",
    note: "Price remains below floor through the observation window.",
  },
  {
    state: "paid",
    title: "Claim eligible",
    note: "Policy can be redeemed from the manager object.",
  },
];

type HomeProps = {
  onOpenDepeg: () => void;
  onOpenProof: () => void;
};

export default function Home({ onOpenDepeg, onOpenProof }: HomeProps) {
  const stagedClaim = TESTNET_PROOF_PACK.stagedClaim;
  const mainnetPool = MAINNET_DEPEG_PROOF_PACK.depegPool;
  const [step, setStep] = useState(0);
  const [livePulse, setLivePulse] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setStep((prev) => (prev + 1) % STEPS.length);
      setLivePulse(true);
      window.setTimeout(() => setLivePulse(false), 350);
    }, 1700);
    return () => clearInterval(timer);
  }, []);

  const proofChecks = useMemo(
    () => [
      {
        label: "Primary market",
        value: "suiUSDe depeg",
        helper: "Mainnet cover pool is deployed",
      },
      {
        label: "Pool",
        value: mainnetPool?.poolId.slice(0, 10) ?? "Missing",
        helper: "Open full ID in Proof Center",
      },
      {
        label: "Lifecycle lab",
        value: stagedClaim?.market ?? "No staged claim",
        helper: `Cover ${stagedClaim?.coverUsd ?? 0} USD on testnet lab`,
      },
      {
        label: "Proof rail",
        value: "Sui + Walrus",
        helper: stagedClaim
          ? `Replay digest ${stagedClaim.digest.slice(0, 8)}...`
          : "Replay pending",
      },
    ],
    [mainnetPool?.poolId, stagedClaim],
  );

  const active = STEPS[step];
  const liveMarkets = RISK_MARKETS.slice(0, 4);
  const passports = PROTOCOL_PASSPORTS.slice(0, 4);

  return (
    <section className="hero-shell">
      <div className="hero-grid">
        <div>
          <div className="eyebrow">SUI RISK CLEARINGHOUSE</div>
          <h1 className="hero-title">The cover desk for Sui DeFi.</h1>
          <p className="muted hero-copy">
            Backstop turns market risk into priced cover, keeper-readable state,
            protocol adapters, and proof receipts. DeepBook prices the risk,
            Sui settles the policy, and Walrus preserves the evidence.
          </p>
          <div className="hero-cta">
            <button className="btn btn-primary" onClick={onOpenProof}>
              Verify mainnet proof
            </button>
            <button className="btn btn-secondary" onClick={onOpenDepeg}>
              Open cover desk
            </button>
          </div>
        </div>

        <div className={`timeline ${livePulse ? "flash" : ""}`}>
          <div className="timeline-title">Policy lifecycle</div>
          <div className="timeline-line" />
          {STEPS.map((s, i) => {
            const activeState = i === step;
            const done = i < step;
            return (
              <div
                className={`timeline-step ${activeState ? "active" : ""} ${done ? "done" : ""}`}
                key={s.state}
              >
                <span className="dot" />
                <span className="timeline-text">
                  <strong>{s.title}</strong>
                  <em>{s.note}</em>
                </span>
              </div>
            );
          })}
          <div className="timeline-footer">
            <div>
              Live policy state{" "}
              <span className="pill active">{active.title}</span>
            </div>
            <a
              href={stagedClaim ? txUrl(stagedClaim.digest, "testnet") : "#"}
              target="_blank"
              rel="noreferrer"
            >
              Open research replay tx
            </a>
          </div>
        </div>
      </div>

      <div className="proof-strip" aria-live="polite">
        {proofChecks.map((row) => (
          <div className="proof-item" key={row.label}>
            <div className="k">{row.label}</div>
            <div className="v">{row.value}</div>
            <div className="muted">{row.helper}</div>
          </div>
        ))}
      </div>

      <div className="metric-grid">
        {CLEARINGHOUSE_METRICS.map((metric) => (
          <div className="metric-card" key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <em>{metric.helper}</em>
          </div>
        ))}
      </div>

      <div className="section-head">
        <div>
          <div className="eyebrow">Cover markets</div>
          <h2>From one depeg pool to a full risk exchange.</h2>
        </div>
        <p className="muted">
          These lanes define where Backstop expands after the first mainnet
          product: stablecoin failures, SUI drawdowns, lending cascades, and LP
          tail risk.
        </p>
      </div>

      <div className="market-grid">
        {liveMarkets.map((market) => (
          <article className="market-card" key={market.id}>
            <div className="market-top">
              <span className={`market-status ${market.status}`}>
                {statusLabel(market.status)}
              </span>
              <strong>SRX {market.score}</strong>
            </div>
            <h3>{market.title}</h3>
            <p className="muted">{market.signal}</p>
            <div className="quote">
              <span className="k">Capacity</span>
              <span className="v">{market.exposureUsd}</span>
            </div>
            <div className="quote">
              <span className="k">Premium band</span>
              <span className="v">{market.premiumBand}</span>
            </div>
            <p className="note ok">{market.deepBookRole}</p>
          </article>
        ))}
      </div>

      <div className="section-head">
        <div>
          <div className="eyebrow">Protocol passports</div>
          <h2>Every integration gets a risk file.</h2>
        </div>
        <p className="muted">
          Backstop should become the public risk layer protocols can point to:
          what is covered, how claims trigger, and which proof is available.
        </p>
      </div>

      <div className="passport-grid">
        {passports.map((passport) => (
          <article className="passport-card" key={passport.protocol}>
            <span>{passport.readiness.replace("-", " ")}</span>
            <h3>{passport.protocol}</h3>
            <strong>{passport.lane}</strong>
            <p className="muted">{passport.risk}</p>
            <p>{passport.integration}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
