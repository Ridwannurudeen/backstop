import { useState } from "react";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
} from "@mysten/dapp-kit";
import { useQuery } from "@tanstack/react-query";
import { fetchPositions, buildClaimTx } from "../lib/predict";
import { getManager } from "../lib/manager";
import { DEFAULT_SYMBOL } from "../lib/markets";
import { usd, fromMicro, fromStrike, shortDate } from "../lib/format";
import { Notice, type NoticeState } from "./Notice";

export default function Portfolio() {
  const account = useCurrentAccount()!;
  const manager = getManager(account.address);
  const { mutateAsync: sign } = useSignAndExecuteTransaction();
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["positions", manager],
    queryFn: () => fetchPositions(manager!),
    enabled: !!manager,
  });

  if (!manager)
    return (
      <div className="card">
        <p className="muted">
          No insurance account yet — buy your first policy to create one.
        </p>
      </div>
    );
  if (isLoading)
    return (
      <div className="card">
        <p className="muted">Loading policies…</p>
      </div>
    );
  if (error)
    return (
      <div className="card">
        <p className="note err">{(error as Error).message}</p>
      </div>
    );

  const policies = data ?? [];
  const now = Date.now();

  async function claim(
    strikeUsd: number,
    oracleId: string,
    expiryMs: number,
    sizeUsd: number,
  ) {
    setNotice(null);
    try {
      const tx = buildClaimTx({
        managerId: manager!,
        oracleId,
        expiryMs: BigInt(expiryMs),
        strikeUsd: BigInt(Math.round(strikeUsd)),
        sizeUsd: BigInt(Math.round(sizeUsd)),
      });
      const { digest } = await sign({ transaction: tx });
      setNotice({ kind: "ok", text: "Payout redeemed", digest });
      refetch();
    } catch (e) {
      setNotice({ kind: "err", text: (e as Error).message });
    }
  }

  return (
    <div className="card">
      <h3>My policies</h3>
      {policies.length === 0 && <p className="muted">No open policies.</p>}
      {policies.map((p, i) => {
        const strikeUsd = fromStrike(p.strike);
        const sizeUsd = fromMicro(p.open_quantity);
        const symbol = p.underlying_asset ?? DEFAULT_SYMBOL;
        const payoutUsd = fromMicro(p.total_payout ?? "0");
        const premiumUsd = fromMicro(p.total_cost ?? "0");
        // Trust the server's settlement status; fall back to expiry for live markets.
        const won = p.status === "won" || payoutUsd > 0;
        const lost = p.status === "lost";
        const settled = won || lost || Number(p.expiry) < now;
        return (
          <div className="policy" key={i}>
            <div>
              <div>
                {symbol} {p.is_up ? "above" : "below"} {usd(strikeUsd)}
              </div>
              <div className="muted">
                {usd(sizeUsd)} insured · expires {shortDate(p.expiry)}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              {won ? (
                <span className="pill active">paid out</span>
              ) : lost ? (
                <span className="pill settled">expired</span>
              ) : settled ? (
                <span className="pill settled">settled</span>
              ) : (
                <span className="pill active">active</span>
              )}
              {won && (
                <div>
                  <div className="muted" style={{ margin: "4px 0" }}>
                    payout {usd(payoutUsd)}
                  </div>
                  <button
                    className="btn"
                    style={{ width: "auto", padding: "6px 12px" }}
                    onClick={() =>
                      claim(strikeUsd, p.oracle_id, Number(p.expiry), sizeUsd)
                    }
                  >
                    Redeem payout
                  </button>
                </div>
              )}
              {lost && (
                <div className="muted" style={{ marginTop: 4, maxWidth: 200 }}>
                  no payout — {usd(premiumUsd)} premium kept by the underwriter
                </div>
              )}
            </div>
          </div>
        );
      })}
      {notice && <Notice {...notice} />}
    </div>
  );
}
