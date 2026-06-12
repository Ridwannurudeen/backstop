import { useQuery } from "@tanstack/react-query";
import { fetchDepeg, DEPEG_THRESHOLD } from "../lib/depeg";
import "./terminal.css";

const SUIVISION = "https://suivision.xyz/object";

export default function DepegCover() {
  const { data, isLoading } = useQuery({
    queryKey: ["depeg"],
    queryFn: fetchDepeg,
    refetchInterval: 15_000,
  });

  return (
    <div className="card">
      <h3>
        Depeg cover{" "}
        <span className="muted" style={{ fontWeight: 400 }}>
          · Sui mainnet · settled trustlessly by Pyth
        </span>
      </h3>
      <p className="muted">
        Buy parametric cover on your stablecoin exposure. LPs underwrite with
        SUI; a policy pays out from a fully-collateralized pool the moment{" "}
        <b>Pyth</b> reports the insured asset at or below{" "}
        <b>${DEPEG_THRESHOLD.toFixed(2)}</b>. Settlement reads Pyth on-chain
        with a freshness bound — <b>no one has to trust Backstop to get paid</b>
        .
      </p>

      {isLoading && <p className="muted">Reading Pyth on Sui mainnet…</p>}
      {!isLoading && !data?.length && (
        <p className="muted">Mainnet Pyth feeds unavailable — retrying.</p>
      )}

      {!!data?.length && (
        <>
          <div className="term-grid">
            {data.map((r) => {
              const ageS = Math.round((Date.now() - r.publishMs) / 1000);
              return (
                <div className="term-stat" key={r.label}>
                  <div className="k">
                    {r.label}
                    {r.flagship ? " ★" : ""} / USD
                  </div>
                  <div
                    className="v"
                    style={{
                      color: r.triggered ? "var(--bad)" : "var(--good)",
                    }}
                  >
                    ${r.price.toFixed(4)}
                  </div>
                  <div className="k" style={{ marginTop: 4 }}>
                    {r.triggered ? "below floor → would pay" : "above floor"} ·{" "}
                    {ageS}s old
                  </div>
                </div>
              );
            })}
          </div>

          <p className="muted" style={{ marginTop: 0 }}>
            Live on-chain Pyth prices ·{" "}
            <a
              href={`${SUIVISION}/${data.find((r) => r.flagship)?.objId ?? data[0].objId}`}
              target="_blank"
              rel="noreferrer"
              style={{ color: "var(--accent)", textDecoration: "none" }}
            >
              Inspect the suiUSDe PriceInfoObject ↗
            </a>
          </p>
          <p className="note">
            ★ suiUSDe is the flagship market (Ethena-backed, live across Sui
            DeFi). The cover pool (pyth_cover_pool) settles every claim against
            the exact PriceInfoObject shown above — pricing is set off-chain,
            settlement is objective and on-chain. Pool deployment to mainnet is
            pending; the settlement read path is already proven live (see
            pythCover harness).
          </p>
        </>
      )}
    </div>
  );
}
