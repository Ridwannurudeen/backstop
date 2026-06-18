import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  PYTH_DEPEG_COVER_PKG,
  PYTH_DEPEG_POOL,
  PYTH_STAGED_CLAIM_TX,
  SUIUSDE_FEED_ID,
} from "../lib/deployment";

const STEPS = [
  {
    label: "Active",
    value: "$1.002",
    detail: "Policy is live while suiUSDe trades above the floor.",
    tone: "safe",
  },
  {
    label: "Breach",
    value: "$0.982",
    detail: "Replay price crosses the $0.985 policy floor.",
    tone: "breach",
  },
  {
    label: "Dwell",
    value: "incomplete",
    detail: "Immediate claim is rejected until the dwell window completes.",
    tone: "dwell",
  },
  {
    label: "Checks",
    value: "passed",
    detail: "Feed identity, freshness, and confidence band are accepted.",
    tone: "safe",
  },
  {
    label: "Claimable",
    value: "latched",
    detail: "A confirmed breach makes the policy eligible to claim.",
    tone: "claimable",
  },
  {
    label: "Paid",
    value: "tx captured",
    detail: "The staged mainnet payout transaction is available for review.",
    tone: "paid",
  },
];

const short = (value: string) => `${value.slice(0, 10)}...${value.slice(-6)}`;

export default function ClaimReplay() {
  const [step, setStep] = useState(0);
  const active = STEPS[step];

  useEffect(() => {
    const timeout = window.setTimeout(
      () => setStep((current) => (current + 1) % STEPS.length),
      step === STEPS.length - 1 ? 2600 : 1800,
    );
    return () => window.clearTimeout(timeout);
  }, [step]);

  const progress = useMemo(
    () => `${((step + 1) / STEPS.length) * 100}%`,
    [step],
  );

  return (
    <section
      className={`claim-replay claim-replay-${active.tone}`}
      id="claim-replay"
      aria-label="Deterministic staged depeg claim replay"
    >
      <div className="replay-top">
        <div>
          <span>Mainnet staged proof replay</span>
          <strong>Claim lifecycle</strong>
        </div>
        <button type="button" onClick={() => setStep(0)}>
          Replay
        </button>
      </div>

      <div className="replay-chart" aria-hidden="true">
        <svg viewBox="0 0 640 260" role="img">
          <defs>
            <linearGradient id="claimLine" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="var(--sui)" />
              <stop offset="62%" stopColor="var(--warn)" />
              <stop offset="100%" stopColor="var(--bad)" />
            </linearGradient>
          </defs>
          <line className="floor-line" x1="34" x2="606" y1="150" y2="150" />
          <text className="floor-label" x="42" y="139">
            POLICY FLOOR $0.985
          </text>
          <path
            className="price-path"
            d="M34 70 C120 74 164 82 228 84 C298 88 354 96 404 128 C448 158 472 193 524 202 C562 208 590 203 606 198"
          />
          <circle
            className="replay-marker"
            cx={[74, 420, 470, 506, 548, 594][step]}
            cy={[72, 136, 188, 202, 204, 198][step]}
            r="7"
          />
          <text className="chart-y top" x="42" y="38">
            $1.002
          </text>
          <text className="chart-y low" x="42" y="226">
            $0.982
          </text>
        </svg>
      </div>

      <div className="replay-status">
        <span>{active.label}</span>
        <strong>{active.value}</strong>
        <p>{active.detail}</p>
      </div>

      <div className="replay-steps" aria-label="Replay stages">
        {STEPS.map((item, index) => (
          <button
            type="button"
            className={index === step ? "active" : ""}
            key={item.label}
            onClick={() => setStep(index)}
          >
            <span>{String(index + 1).padStart(2, "0")}</span>
            {item.label}
          </button>
        ))}
      </div>

      <div className="replay-progress" aria-hidden="true">
        <span style={{ width: progress }} />
      </div>

      <div className="receipt-card">
        <div>
          <span>Settlement receipt</span>
          <strong>Staged payout paid on Sui mainnet</strong>
        </div>
        <dl>
          <div>
            <dt>Pool</dt>
            <dd>{short(PYTH_DEPEG_POOL)}</dd>
          </div>
          <div>
            <dt>Package</dt>
            <dd>{short(PYTH_DEPEG_COVER_PKG)}</dd>
          </div>
          <div>
            <dt>Feed</dt>
            <dd>{short(`0x${SUIUSDE_FEED_ID}`)}</dd>
          </div>
          <div>
            <dt>Tx</dt>
            <dd>{short(PYTH_STAGED_CLAIM_TX)}</dd>
          </div>
        </dl>
        <Link to="/proof">Open receipt evidence</Link>
      </div>
    </section>
  );
}
