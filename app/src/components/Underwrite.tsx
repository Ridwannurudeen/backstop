import { useState } from "react";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import { buildUnderwriteTx } from "../lib/predict";
import { Notice, type NoticeState } from "./Notice";

export default function Underwrite() {
  const account = useCurrentAccount()!;
  const client = useSuiClient();
  const { mutateAsync: sign, isPending } = useSignAndExecuteTransaction();
  const [sizeUsd, setSizeUsd] = useState(500);
  const [notice, setNotice] = useState<NoticeState | null>(null);

  async function supply() {
    setNotice(null);
    try {
      const tx = await buildUnderwriteTx(client, {
        owner: account.address,
        sizeUsd: BigInt(sizeUsd),
      });
      const { digest } = await sign({ transaction: tx });
      setNotice({ kind: "ok", text: "Supplied to the vault", digest });
    } catch (e) {
      setNotice({ kind: "err", text: (e as Error).message });
    }
  }

  return (
    <div className="card">
      <h3>Underwrite - DeepBook Lab</h3>
      <p className="muted">
        Testnet-only DeepBook Predict vault. Deposit DUSDC, receive PLP, and
        earn the premiums lab buyers pay for protection.
      </p>
      <div className="field" style={{ maxWidth: 240 }}>
        <label>Amount to supply ($)</label>
        <input
          type="number"
          value={sizeUsd}
          onChange={(e) => setSizeUsd(+e.target.value)}
        />
      </div>
      <button className="btn" disabled={isPending} onClick={supply}>
        {isPending ? "Supplying..." : "Supply liquidity"}
      </button>
      {notice && <Notice {...notice} />}
    </div>
  );
}
