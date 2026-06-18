import { useMemo, useState } from "react";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import { useQuery } from "@tanstack/react-query";
import {
  buildDepegBuyCoverTx,
  quoteDepegPremium,
  readDepegPool,
  readDepegPrice,
} from "@gudman/backstop-sdk";
import { MAINNET_DEPEG_PROOF_PACK } from "../lib/proofData";
import { Notice, type NoticeState } from "./Notice";
import "./treasury.css";

const MIST_PER_SUI = 1_000_000_000;
const COVERAGE_OPTIONS = [25, 50, 100];
const TERM_OPTIONS = [7, 14, 30];

const suiToMist = (amount: number) =>
  BigInt(Math.max(0, Math.round(amount * MIST_PER_SUI)));

const mistToSui = (amount: bigint) => Number(amount) / MIST_PER_SUI;

export default function TreasuryProtect() {
  const account = useCurrentAccount()!;
  const client = useSuiClient();
  const { mutateAsync: sign, isPending } = useSignAndExecuteTransaction();
  const depeg = MAINNET_DEPEG_PROOF_PACK.depegPool!;

  const [treasuryExposureSui, setTreasuryExposureSui] = useState(1);
  const [coveragePct, setCoveragePct] = useState(50);
  const [termDays, setTermDays] = useState(14);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<NoticeState | null>(null);

  const { data: pool } = useQuery({
    queryKey: ["treasury-depeg-pool", depeg.poolId],
    queryFn: () => readDepegPool(client, depeg.poolId),
    refetchInterval: 15_000,
  });

  const { data: price } = useQuery({
    queryKey: ["treasury-depeg-price", depeg.priceObjectId],
    queryFn: () =>
      readDepegPrice(client, {
        priceObject: depeg.priceObjectId,
        thresholdUsd: 0.985,
      }),
    retry: false,
    refetchInterval: 20_000,
  });

  const coverSui = useMemo(
    () => Math.max(0, (treasuryExposureSui * coveragePct) / 100),
    [coveragePct, treasuryExposureSui],
  );

  const premiumMist = useMemo(() => {
    if (!pool || coverSui <= 0) return null;
    return quoteDepegPremium(pool, suiToMist(coverSui), termDays);
  }, [coverSui, pool, termDays]);

  async function insure() {
    if (!premiumMist || !pool) return;
    setBusy(true);
    setNotice(null);
    try {
      const expiryMs = BigInt(Date.now() + termDays * 86_400_000 - 60_000);
      const tx = buildDepegBuyCoverTx({
        pkg: depeg.packageId,
        poolId: depeg.poolId,
        premiumMist,
        coverMist: suiToMist(coverSui),
        expiryMs,
        owner: account.address,
      });
      const { digest } = await sign({ transaction: tx });
      setNotice({ kind: "ok", text: "Treasury depeg cover created", digest });
    } catch (e) {
      setNotice({ kind: "err", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h3>Insure treasury exposure</h3>
      <p className="muted">
        Plan account-level cover for a treasury or protocol bucket, then create
        a mainnet policy against the live suiUSDe depeg pool.
      </p>

      <div className="treasury-total">{coverSui.toFixed(4)} SUI</div>
      <div className="muted">planned cover amount</div>

      <div className="row" style={{ marginTop: 16 }}>
        <div className="field">
          <label>Treasury exposure (SUI equivalent)</label>
          <input
            type="number"
            min="0"
            step="0.001"
            value={treasuryExposureSui}
            onChange={(e) => setTreasuryExposureSui(Number(e.target.value))}
          />
        </div>
        <div className="field">
          <label>Coverage of exposure</label>
          <div className="seg">
            {COVERAGE_OPTIONS.map((pct) => (
              <button
                key={pct}
                className={coveragePct === pct ? "on" : ""}
                onClick={() => setCoveragePct(pct)}
                type="button"
              >
                {pct}%
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>Term</label>
          <div className="seg">
            {TERM_OPTIONS.map((days) => (
              <button
                key={days}
                className={termDays === days ? "on" : ""}
                onClick={() => setTermDays(days)}
                type="button"
              >
                {days}d
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="quote">
        <span className="k">Live suiUSDe price</span>
        <span className="v">
          {price ? `$${price.priceUsd.toFixed(4)}` : "Unavailable"}
        </span>
      </div>
      <div className="quote">
        <span className="k">Premium</span>
        <span className="v">
          {premiumMist ? `${mistToSui(premiumMist).toFixed(6)} SUI` : "Loading"}
        </span>
      </div>
      <div className="quote">
        <span className="k">Pool max per policy</span>
        <span className="v">
          {pool && pool.maxCoverPerPolicyMist > 0n
            ? `${mistToSui(pool.maxCoverPerPolicyMist).toFixed(4)} SUI`
            : "Pool configured cap"}
        </span>
      </div>

      <button
        className="btn"
        disabled={busy || isPending || !premiumMist || coverSui <= 0}
        onClick={insure}
      >
        {busy || isPending ? "Insuring..." : "Create treasury cover policy"}
      </button>

      <p className="note">
        Protocol adapters should persist the returned policy object against the
        protected account or vault bucket.
      </p>

      {notice && <Notice {...notice} />}
    </div>
  );
}
