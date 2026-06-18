import { useState } from "react";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import { useQuery } from "@tanstack/react-query";
import {
  buildDepegDepositLpTx,
  readDepegPool,
} from "@gudman/backstop-sdk";
import { MAINNET_DEPEG_PROOF_PACK } from "../lib/proofData";
import { Notice, type NoticeState } from "./Notice";

const MIST_PER_SUI = 1_000_000_000;

const suiToMist = (amount: number) =>
  BigInt(Math.max(0, Math.round(amount * MIST_PER_SUI)));

const mistToSui = (amount: bigint) => Number(amount) / MIST_PER_SUI;

export default function Underwrite() {
  const account = useCurrentAccount()!;
  const client = useSuiClient();
  const { mutateAsync: sign, isPending } = useSignAndExecuteTransaction();
  const depeg = MAINNET_DEPEG_PROOF_PACK.depegPool!;
  const [amountSui, setAmountSui] = useState(0.1);
  const [notice, setNotice] = useState<NoticeState | null>(null);

  const { data: pool } = useQuery({
    queryKey: ["underwrite-depeg-pool", depeg.poolId],
    queryFn: () => readDepegPool(client, depeg.poolId),
    refetchInterval: 15_000,
  });

  async function supply() {
    setNotice(null);
    try {
      const tx = buildDepegDepositLpTx({
        pkg: depeg.packageId,
        poolId: depeg.poolId,
        amountMist: suiToMist(amountSui),
        owner: account.address,
      });
      const { digest } = await sign({ transaction: tx });
      setNotice({ kind: "ok", text: "Supplied liquidity to depeg pool", digest });
    } catch (e) {
      setNotice({ kind: "err", text: (e as Error).message });
    }
  }

  return (
    <div className="card">
      <h3>Underwrite depeg cover</h3>
      <p className="muted">
        Supply SUI liquidity into the mainnet depeg pool and receive an LP share
        object. Premiums accrue into the pool, while valid latched claims draw
        from funded liquidity.
      </p>

      <div className="proof-strip">
        <div className="proof-item">
          <div className="k">Pool capital</div>
          <div className="v">
            {pool ? `${mistToSui(pool.fundsMist).toFixed(4)} SUI` : "Loading"}
          </div>
          <div className="muted">Funded by LP deposits and retained premiums</div>
        </div>
        <div className="proof-item">
          <div className="k">Outstanding cover</div>
          <div className="v">
            {pool ? `${mistToSui(pool.totalCoverMist).toFixed(4)} SUI` : "Loading"}
          </div>
          <div className="muted">Liability cap enforced by the pool</div>
        </div>
      </div>

      <div className="field" style={{ maxWidth: 240 }}>
        <label>Amount to supply (SUI)</label>
        <input
          type="number"
          min="0.001"
          step="0.001"
          value={amountSui}
          onChange={(e) => setAmountSui(Number(e.target.value))}
        />
      </div>

      <button
        className="btn"
        disabled={isPending || amountSui <= 0}
        onClick={supply}
      >
        {isPending ? "Supplying..." : "Supply liquidity"}
      </button>

      <p className="note">
        LP shares are mainnet objects. Use small deposits until external review
        and liquidity policy are complete.
      </p>

      {notice && <Notice {...notice} />}
    </div>
  );
}
