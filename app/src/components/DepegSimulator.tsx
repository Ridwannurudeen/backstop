import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ConnectButton } from "@mysten/dapp-kit";
import { fetchDepeg, DEPEG_THRESHOLD, DEPEG_FEEDS } from "../lib/depeg";
import { usd } from "../lib/format";
import "./terminal.css";

// Flat estimate rate for the simulator. The current pool prices a flat premium_bps;
// production v2 will price on utilization — so this is labelled an estimate in the UI.
const EST_PREMIUM_RATE = 0.02; // 2% of cover per term
const TERMS = [7, 30, 90];

export default function DepegSimulator() {
  const { data } = useQuery({
    queryKey: ["depeg"],
    queryFn: fetchDepeg,
    refetchInterval: 15_000,
  });

  const flagship = DEPEG_FEEDS.find((f) => f.flagship) ?? DEPEG_FEEDS[0];
  const [asset, setAsset] = useState(flagship.label);
  const [coverage, setCoverage] = useState(1000);
  const [floor, setFloor] = useState(DEPEG_THRESHOLD);
  const [term, setTerm] = useState(30);

  const reading = data?.find((r) => r.label === asset);
  const price = reading?.price ?? null;
  const triggeredNow = price != null && price <= floor;
  const premium = Math.max(coverage, 0) * EST_PREMIUM_RATE;
  const maxPayout = Math.max(coverage, 0);

  return (
    <div className="card" id="depeg-simulator">
      <h3>
        Depeg cover simulator <span className="sub">· no wallet needed</span>
      </h3>
      <p className="lead">
        Size a policy and see the premium, payout, and exactly how it settles —
        then connect a wallet to execute on mainnet. Settlement reads Pyth
        on-chain, so no one has to trust Backstop to get paid.
      </p>

      <div className="row">
        <div className="field">
          <label>Asset</label>
          <select value={asset} onChange={(e) => setAsset(e.target.value)}>
            {DEPEG_FEEDS.map((f) => (
              <option key={f.label} value={f.label}>
                {f.label}
                {f.flagship ? " ★" : ""}
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
        <div className="field">
          <label>Depeg floor (USD)</label>
          <input
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={floor}
            onChange={(e) => setFloor(Number(e.target.value))}
          />
        </div>
        <div className="field">
          <label>Term</label>
          <select value={term} onChange={(e) => setTerm(+e.target.value)}>
            {TERMS.map((t) => (
              <option key={t} value={t}>
                {t}d
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="term-grid">
        <div className="term-stat">
          <div className="k">Estimated premium</div>
          <div className="v">{usd(premium)}</div>
          <div className="k">
            ~{(EST_PREMIUM_RATE * 100).toFixed(1)}% of cover · est.
          </div>
        </div>
        <div className="term-stat">
          <div className="k">Max payout</div>
          <div className="v">{usd(maxPayout)}</div>
          <div className="k">
            paid if {asset} ≤ {usd(floor)}
          </div>
        </div>
        <div className="term-stat">
          <div className="k">{asset} now</div>
          <div className={`v ${triggeredNow ? "val-bad" : ""}`}>
            {price != null ? `$${price.toFixed(4)}` : "—"}
          </div>
          <div className="k">
            {price == null
              ? "reading Pyth…"
              : triggeredNow
                ? "below floor — would pay"
                : "above floor"}
          </div>
        </div>
        <div className="term-stat">
          <div className="k">Coverage window</div>
          <div className="v">{term}d</div>
        </div>
      </div>

      <h4>How it settles</h4>
      <p className="note">
        <strong>1.</strong> You buy {usd(maxPayout)} of cover on {asset}; the
        premium flows to the pool's liquidity providers.
      </p>
      <p className="note">
        <strong>2.</strong> If Pyth reports {asset} at or below {usd(floor)}, a
        keeper records the breach on-chain (reads the live Pyth feed).
      </p>
      <p className="note">
        <strong>3.</strong> You claim — the pool pays {usd(maxPayout)} straight
        to you, settled trustlessly off Pyth. No claims committee.
      </p>

      <div style={{ marginTop: 16 }}>
        <ConnectButton />
        <p className="note">
          Connect to execute. The live mainnet buy ships with the production
          pool deploy; the premium here is an estimate — the live pool prices on
          utilization.
        </p>
      </div>
    </div>
  );
}
