import { useState } from "react";
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
  const adversePrice = reading?.adversePrice ?? null;
  const triggeredNow =
    reading != null &&
    adversePrice != null &&
    adversePrice <= floor &&
    reading.confBps <= DEPEG_MAX_CONF_BPS;
  const premium = Math.max(coverage, 0) * EST_PREMIUM_RATE;
  const maxPayout = Math.max(coverage, 0);
  const floorLabel = `$${floor.toFixed(3)}`;

  return (
    <div className="card" id="depeg-simulator">
      <h3>
        Depeg cover simulator <span className="sub">- no wallet needed</span>
      </h3>
      <p className="lead">
        Size a policy and see the premium, payout, and settlement path, then
        connect a wallet to execute on mainnet. Settlement reads Pyth on-chain
        and follows the pool's objective payout rules.
      </p>

      <div className="row">
        <div className="field">
          <label>Asset</label>
          <select value={asset} onChange={(e) => setAsset(e.target.value)}>
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
        <div className="field">
          <label>Depeg floor (USD)</label>
          <input
            type="number"
            min={0}
            max={1}
            step={0.001}
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
            ~{(EST_PREMIUM_RATE * 100).toFixed(1)}% of cover - estimate
          </div>
        </div>
        <div className="term-stat">
          <div className="k">Max payout</div>
          <div className="v">{usd(maxPayout)}</div>
          <div className="k">paid if adverse band at most {floorLabel}</div>
        </div>
        <div className="term-stat">
          <div className="k">{asset} now</div>
          <div className={`v ${triggeredNow ? "val-bad" : ""}`}>
            {price != null ? `$${price.toFixed(4)}` : "-"}
          </div>
          <div className="k">
            {price == null
              ? "reading Pyth..."
              : triggeredNow
                ? "adverse band below floor"
                : `adverse ${adversePrice != null ? `$${adversePrice.toFixed(4)}` : "n/a"}`}
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
        <strong>2.</strong> If Pyth's price plus confidence is at or below{" "}
        {floorLabel}, a keeper records the breach on-chain and confirms it after
        the dwell window.
      </p>
      <p className="note">
        <strong>3.</strong> You claim - the pool pays {usd(maxPayout)} under the
        Pyth-settled pool rules. No claims committee.
      </p>

      <div style={{ marginTop: 16 }}>
        <ConnectButton />
        <p className="note">
          Connect to execute against the deployed mainnet pool. The premium here
          is an estimate; the live pool prices on utilization.
        </p>
      </div>
    </div>
  );
}
