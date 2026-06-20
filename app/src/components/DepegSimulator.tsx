import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ConnectButton } from "@mysten/dapp-kit";
import {
  fetchDepeg,
  DEPEG_THRESHOLD,
  DEPEG_FEEDS,
  DEPEG_MAX_CONF_BPS,
} from "../lib/depeg";
import { usd } from "../lib/format";
import "./terminal.css";

// Simple simulator estimate; the live pool prices on utilization.
const EST_PREMIUM_RATE = 0.02;
// These mirror the deployed pool (verified on-chain): floor $0.985, a 5-minute
// sustained-breach dwell, and a 5-minute activation delay.
const FLOOR = DEPEG_THRESHOLD;
const DWELL_SECS = 300;
const ACTIVATION_SECS = 300;
const SLIDER_MIN = 0.9;
const SLIDER_MAX = 1.01;
const CRASH_PRICE = 0.97;
// The dwell bar animates over a few seconds to represent the real 5-minute window.
const DWELL_ANIM_MS = 4000;
const DWELL_STEP_MS = 120;

type Phase = "safe" | "confirming" | "paid";

export default function DepegSimulator() {
  const { data } = useQuery({
    queryKey: ["depeg"],
    queryFn: fetchDepeg,
    refetchInterval: 15_000,
  });

  const flagship = DEPEG_FEEDS.find((f) => f.flagship) ?? DEPEG_FEEDS[0];
  const [asset, setAsset] = useState(flagship.label);
  const [coverage, setCoverage] = useState(1000);
  const [simPrice, setSimPrice] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>("safe");
  const [dwellPct, setDwellPct] = useState(0);
  const touched = useRef(false);

  const reading = data?.find((r) => r.label === asset);
  const livePrice = reading?.price ?? null;

  // Seed the simulated price from the live Pyth price once it loads, until the
  // user takes the wheel.
  useEffect(() => {
    if (!touched.current && livePrice != null) setSimPrice(livePrice);
  }, [livePrice]);

  const breached = simPrice != null && simPrice <= FLOOR;

  // Drive the on-chain state machine: a sustained sub-floor price arms the dwell,
  // and once the dwell window elapses the policy latches and pays out. Recovering
  // above the floor before confirmation resets it (wicks don't pay).
  useEffect(() => {
    if (!breached) {
      setPhase("safe");
      setDwellPct(0);
      return;
    }
    setPhase("confirming");
    setDwellPct(0);
    const id = setInterval(() => {
      setDwellPct((p) => {
        const next = p + (DWELL_STEP_MS / DWELL_ANIM_MS) * 100;
        if (next >= 100) {
          clearInterval(id);
          setPhase("paid");
          return 100;
        }
        return next;
      });
    }, DWELL_STEP_MS);
    return () => clearInterval(id);
  }, [breached]);

  const setPrice = (p: number) => {
    touched.current = true;
    setSimPrice(p);
  };
  const resetLive = () => {
    touched.current = false;
    if (livePrice != null) setSimPrice(livePrice);
  };

  const premium = Math.max(coverage, 0) * EST_PREMIUM_RATE;
  const payout = Math.max(coverage, 0);
  const priceLabel = simPrice != null ? `$${simPrice.toFixed(4)}` : "-";

  const banner =
    phase === "paid"
      ? {
          cls: "stress-paid",
          tag: "PAID OUT",
          line: `Payout of ${usd(payout)} released in SUI to the holder - automatically, no claim filed.`,
        }
      : phase === "confirming"
        ? {
            cls: "stress-armed",
            tag: "BREACH - confirming dwell",
            line: `${asset} is below the $${FLOOR.toFixed(3)} floor. The policy is armed; settlement waits out the sustained-breach dwell.`,
          }
        : {
            cls: "stress-safe",
            tag: "ACTIVE",
            line: `${asset} is above the $${FLOOR.toFixed(3)} floor. Cover is live and no payout is owed.`,
          };

  return (
    <div className="card" id="depeg-simulator">
      <h3>
        Depeg stress test{" "}
        <span className="sub">- drive the price, watch it settle</span>
      </h3>
      <p className="lead">
        Crash the market yourself and watch a policy walk through its real
        on-chain settlement path. This is a simulation that mirrors the live
        pool's rules (floor ${FLOOR.toFixed(3)}, {DWELL_SECS / 60}-min dwell,{" "}
        {ACTIVATION_SECS / 60}-min activation). The real lifecycle is already
        proven on mainnet.
      </p>

      <div className="row">
        <div className="field">
          <label>Asset</label>
          <select
            value={asset}
            onChange={(e) => {
              setAsset(e.target.value);
              resetLive();
            }}
          >
            {DEPEG_FEEDS.map((f) => (
              <option key={f.label} value={f.label}>
                {f.label}
                {f.flagship ? " *" : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Coverage (USD)</label>
          <input
            type="number"
            min={0}
            step={100}
            value={coverage}
            onChange={(e) => setCoverage(Math.max(0, Number(e.target.value)))}
          />
        </div>
      </div>

      <div className={`stress-banner ${banner.cls}`}>
        <div className="stress-head">
          <span className="stress-tag">{banner.tag}</span>
          <span className="stress-price">{priceLabel}</span>
        </div>
        <p className="stress-line">{banner.line}</p>
        {phase !== "safe" && (
          <div className="depeg-progress" aria-label="Dwell progress">
            <span style={{ width: `${dwellPct}%` }} />
          </div>
        )}
      </div>

      <div className="field" style={{ marginTop: 14 }}>
        <label>
          Simulated {asset} price - drag to crash it (floor ${FLOOR.toFixed(3)})
        </label>
        <input
          type="range"
          min={SLIDER_MIN}
          max={SLIDER_MAX}
          step={0.001}
          value={simPrice ?? livePrice ?? 1}
          onChange={(e) => setPrice(Number(e.target.value))}
        />
      </div>
      <div className="stress-controls">
        <button className="btn" onClick={() => setPrice(CRASH_PRICE)}>
          Simulate a crash
        </button>
        <button
          className="btn ghost"
          onClick={resetLive}
          disabled={livePrice == null}
        >
          Reset to live price
        </button>
        <span className="note" style={{ margin: 0 }}>
          {livePrice != null
            ? `live Pyth: $${livePrice.toFixed(4)}`
            : "reading Pyth..."}
        </span>
      </div>

      <div className="term-grid" style={{ marginTop: 16 }}>
        <div className="term-stat">
          <div className="k">Simulated price</div>
          <div className={`v ${breached ? "val-bad" : "val-good"}`}>
            {priceLabel}
          </div>
        </div>
        <div className="term-stat">
          <div className="k">Depeg floor</div>
          <div className="v">${FLOOR.toFixed(3)}</div>
        </div>
        <div className="term-stat">
          <div className="k">Estimated premium</div>
          <div className="v">{usd(premium)}</div>
          <div className="k">
            ~{(EST_PREMIUM_RATE * 100).toFixed(0)}% of cover
          </div>
        </div>
        <div className="term-stat">
          <div className="k">Payout if it depegs</div>
          <div className={`v ${phase === "paid" ? "val-good" : ""}`}>
            {usd(payout)}
          </div>
        </div>
      </div>

      <h4>How it settles on-chain</h4>
      <p className="note">
        <strong>1.</strong> You buy {usd(payout)} of cover on {asset}; the
        premium flows to the pool's liquidity providers.
      </p>
      <p className="note">
        <strong>2.</strong> If Pyth's price plus confidence stays at or below $
        {FLOOR.toFixed(3)} for the dwell window, the breach latches on-chain - a
        brief dip that recovers does not pay.
      </p>
      <p className="note">
        <strong>3.</strong> You claim - the pool pays {usd(payout)} under the
        Pyth-settled rules. No claims committee, no counterparty.
      </p>

      <div style={{ marginTop: 16 }}>
        <ConnectButton />
        <p className="note">
          Connect to buy real cover against the deployed mainnet pool. The dwell
          here is sped up to a few seconds; on-chain it is a true{" "}
          {DWELL_SECS / 60}-minute sustained-breach window, and confidence band
          checks ({DEPEG_MAX_CONF_BPS} bps) keep noisy ticks from paying.
        </p>
      </div>
    </div>
  );
}
