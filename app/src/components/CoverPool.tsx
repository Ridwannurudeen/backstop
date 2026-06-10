import { useState } from "react";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchPoolState,
  fetchFeedProbBps,
  quoteCoverPremium,
  buildDepositLpTx,
  buildBuyCoverTx,
  buildClaimTx,
  fetchMyPolicies,
  fetchMyShares,
} from "../lib/coverPool";
import { sui } from "../lib/format";
import { Notice, type NoticeState } from "./Notice";
import "./terminal.css";

const MIST = 1_000_000_000;
const toMist = (suiAmt: number) => BigInt(Math.round(suiAmt * MIST));
const COVER_EXPIRY_MS = 30 * 86_400_000; // 30-day cover

export default function CoverPool() {
  const account = useCurrentAccount()!;
  const client = useSuiClient();
  const qc = useQueryClient();
  const { mutateAsync: sign, isPending } = useSignAndExecuteTransaction();

  const [depositSui, setDepositSui] = useState(0.1);
  const [coverSui, setCoverSui] = useState(0.05);
  const [notice, setNotice] = useState<NoticeState | null>(null);

  const { data: pool } = useQuery({
    queryKey: ["cover-pool"],
    queryFn: async () => {
      const [state, probBps] = await Promise.all([
        fetchPoolState(client),
        fetchFeedProbBps(client, account.address),
      ]);
      return { state, probBps };
    },
    refetchInterval: 15_000,
  });

  const { data: mine } = useQuery({
    queryKey: ["cover-mine", account.address],
    queryFn: async () => {
      const [policies, shares] = await Promise.all([
        fetchMyPolicies(client, account.address),
        fetchMyShares(client, account.address),
      ]);
      return { policies, shares };
    },
    refetchInterval: 15_000,
  });

  const coverMist = toMist(coverSui);
  const { data: premiumMist } = useQuery({
    queryKey: ["cover-premium", coverMist.toString()],
    queryFn: () => quoteCoverPremium(client, coverMist, account.address),
    enabled: coverSui > 0 && !!pool,
  });

  const refresh = () =>
    qc.invalidateQueries({
      predicate: (q) => /^cover-/.test(String(q.queryKey[0])),
    });

  async function run(
    build: () => ReturnType<typeof buildDepositLpTx>,
    ok: string,
  ) {
    setNotice(null);
    try {
      const { digest } = await sign({ transaction: build() });
      setNotice({ kind: "ok", text: ok, digest });
      refresh();
    } catch (e) {
      setNotice({ kind: "err", text: (e as Error).message });
    }
  }

  const deposit = () =>
    run(
      () => buildDepositLpTx(toMist(depositSui), account.address),
      `Supplied ${depositSui} SUI to the pool`,
    );

  const buy = () => {
    if (!premiumMist) return;
    run(
      () =>
        buildBuyCoverTx({
          coverMist,
          premiumMist,
          expiryMs: BigInt(Date.now() + COVER_EXPIRY_MS),
          owner: account.address,
        }),
      `Bought ${coverSui} SUI of cover`,
    );
  };

  const claim = (policyId: string) =>
    run(
      () => buildClaimTx(policyId, account.address),
      "Claim paid out from the pool",
    );

  const s = pool?.state;
  const prob = pool?.probBps ?? 0;
  const triggered = s ? prob >= s.triggerBps : false;
  const util =
    s && s.fundsMist > 0n
      ? Number((s.totalCover * 10_000n) / s.fundsMist) / 100
      : 0;

  return (
    <div className="card">
      <h3>Cover pool — parametric crash insurance</h3>
      <p className="muted">
        A native, fully-collateralized pool on Sui: LPs supply SUI and earn
        premiums, buyers get crash cover priced live off the on-chain RiskFeed,
        and claims settle straight from the pool when the market crosses the
        trigger. Market <b>{s?.market ?? "—"}</b>.
      </p>

      <div className="term-grid">
        <div className="term-stat">
          <div className="k">Pool TVL</div>
          <div className="v">{s ? sui(s.fundsMist) : "—"}</div>
        </div>
        <div className="term-stat">
          <div className="k">Outstanding cover</div>
          <div className="v">{s ? sui(s.totalCover) : "—"}</div>
        </div>
        <div className="term-stat">
          <div className="k">Utilization</div>
          <div className="v">{s ? `${util.toFixed(1)}%` : "—"}</div>
        </div>
        <div className="term-stat">
          <div className="k">Crash prob / trigger</div>
          <div
            className="v"
            style={{ color: triggered ? "var(--bad)" : undefined }}
          >
            {s
              ? `${(prob / 100).toFixed(1)}% / ${(s.triggerBps / 100).toFixed(0)}%`
              : "—"}
          </div>
        </div>
      </div>

      <div className="row">
        <div className="field">
          <label>Provide liquidity (SUI)</label>
          <input
            type="number"
            min={0}
            step={0.01}
            value={depositSui}
            onChange={(e) => setDepositSui(+e.target.value)}
          />
          <button
            className="btn"
            disabled={isPending || depositSui <= 0}
            onClick={deposit}
          >
            {isPending ? "Working…" : "Deposit & underwrite"}
          </button>
        </div>

        <div className="field">
          <label>Buy cover (SUI of payout)</label>
          <input
            type="number"
            min={0}
            step={0.01}
            value={coverSui}
            onChange={(e) => setCoverSui(+e.target.value)}
          />
          <div className="quote">
            <span className="k">Premium</span>
            <span className="v">
              {premiumMist !== undefined ? sui(premiumMist) : "—"}
            </span>
          </div>
          <button
            className="btn"
            disabled={isPending || coverSui <= 0 || premiumMist === undefined}
            onClick={buy}
          >
            {isPending ? "Working…" : "Buy cover"}
          </button>
        </div>
      </div>

      {notice && <Notice {...notice} />}

      <h4 style={{ margin: "18px 0 6px" }}>My positions</h4>
      <p className="muted" style={{ marginTop: 0 }}>
        LP shares held: {mine ? mine.shares.toString() : "—"}
      </p>
      {mine && mine.policies.length === 0 && (
        <p className="muted">No cover policies yet.</p>
      )}
      {mine?.policies.map((p) => {
        const expired = Date.now() >= p.expiryMs;
        const canClaim = prob >= p.triggerBps && !expired;
        return (
          <div className="policy" key={p.id}>
            <div>
              <div>{sui(p.coverMist)} cover</div>
              <div className="muted">
                trigger {(p.triggerBps / 100).toFixed(0)}% · expires{" "}
                {new Date(p.expiryMs).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </div>
            </div>
            <button
              className="btn"
              style={{ width: "auto", marginTop: 0 }}
              disabled={isPending || !canClaim}
              onClick={() => claim(p.id)}
            >
              {expired
                ? "Expired"
                : canClaim
                  ? "Claim payout"
                  : "Awaiting trigger"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
