import { useMemo, useState } from "react";
import { useSuiClient } from "@mysten/dapp-kit";
import { useQuery } from "@tanstack/react-query";
import {
  quoteDepegPremium,
  readDepegPool,
  readDepegPrice,
} from "@gudman/backstop-sdk";
import { usd } from "../lib/format";
import { MAINNET_DEPEG_PROOF_PACK } from "../lib/proofData";

const MIST_PER_SUI = 1_000_000_000;
const TERM_OPTIONS = [7, 14, 30];

const suiToMist = (amount: number) =>
  BigInt(Math.max(0, Math.round(amount * MIST_PER_SUI)));

const mistToSui = (amount: bigint) => Number(amount) / MIST_PER_SUI;

export default function PublicDepegQuote() {
  const client = useSuiClient();
  const depeg = MAINNET_DEPEG_PROOF_PACK.depegPool!;
  const [coverSui, setCoverSui] = useState(0.05);
  const [termDays, setTermDays] = useState(14);

  const { data: pool, isLoading: poolLoading } = useQuery({
    queryKey: ["public-mainnet-depeg-pool", depeg.poolId],
    queryFn: () => readDepegPool(client, depeg.poolId),
    refetchInterval: 15_000,
  });

  const { data: price } = useQuery({
    queryKey: ["public-mainnet-depeg-price", depeg.priceObjectId],
    queryFn: () =>
      readDepegPrice(client, {
        priceObject: depeg.priceObjectId,
        thresholdUsd: 0.985,
      }),
    retry: false,
    refetchInterval: 20_000,
  });

  const quote = useMemo(() => {
    if (!pool) return null;
    const coverMist = suiToMist(coverSui);
    if (coverMist <= 0n) return null;
    return quoteDepegPremium(pool, coverMist, termDays);
  }, [coverSui, pool, termDays]);

  const utilization =
    pool && pool.fundsMist > 0n
      ? Math.min(
          100,
          (Number(pool.totalCoverMist) / Number(pool.fundsMist)) * 100,
        )
      : 0;

  return (
    <div className="card public-quote">
      <div className="proof-head">
        <div>
          <h3>No-wallet mainnet quote</h3>
          <p className="muted">
            Read-only quote simulator for the deployed suiUSDe depeg pool. It
            uses the same pool state and premium function as the wallet buy
            flow, without asking a judge to connect a wallet.
          </p>
        </div>
        <div className="proof-pill">suiUSDe floor: $0.985</div>
      </div>

      <div className="proof-strip proof-strip-wide">
        <div className="proof-item">
          <div className="k">Live price</div>
          <div className="v">
            {price ? usd(price.priceUsd) : poolLoading ? "Loading" : "Unavailable"}
          </div>
          <div className="muted">Triggered: {price?.triggered ? "yes" : "no"}</div>
        </div>
        <div className="proof-item">
          <div className="k">Pool capital</div>
          <div className="v">
            {pool ? `${mistToSui(pool.fundsMist).toFixed(4)} SUI` : "Loading"}
          </div>
          <div className="muted">{utilization.toFixed(1)}% utilized</div>
        </div>
        <div className="proof-item">
          <div className="k">Outstanding cover</div>
          <div className="v">
            {pool ? `${mistToSui(pool.totalCoverMist).toFixed(4)} SUI` : "Loading"}
          </div>
          <div className="muted">Pool cap enforced on-chain</div>
        </div>
      </div>

      <div className="row">
        <div className="field">
          <label>Cover amount (SUI)</label>
          <input
            type="number"
            min="0.001"
            step="0.001"
            value={coverSui}
            onChange={(e) => setCoverSui(Number(e.target.value))}
          />
        </div>
        <div className="field">
          <label>Term</label>
          <select
            value={termDays}
            onChange={(e) => setTermDays(Number(e.target.value))}
          >
            {TERM_OPTIONS.map((days) => (
              <option key={days} value={days}>
                {days} days
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="quote">
        <span className="k">Premium</span>
        <span className="v">
          {quote ? `${mistToSui(quote).toFixed(6)} SUI` : "Loading"}
        </span>
      </div>
      <div className="quote">
        <span className="k">Max payout</span>
        <span className="v">{coverSui.toFixed(4)} SUI</span>
      </div>
    </div>
  );
}
