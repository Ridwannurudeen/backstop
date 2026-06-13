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
        Depeg cover <span className="sub">· settled trustlessly by Pyth</span>
      </h3>
      <p className="lead">
        Parametric cover on stablecoin exposure. A policy pays from a
        fully-collateralized pool the moment Pyth reports the asset at or below
        ${DEPEG_THRESHOLD.toFixed(2)} — settlement reads Pyth on-chain, so no
        one has to trust Backstop to get paid.
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
                  <div className="k">{r.label} / USD</div>
                  <div className={`v ${r.triggered ? "val-bad" : ""}`}>
                    ${r.price.toFixed(4)}
                  </div>
                  <div className="k">
                    {r.triggered ? "below floor — would pay" : "above floor"} ·{" "}
                    {ageS}s old
                  </div>
                </div>
              );
            })}
          </div>

          <p className="muted">
            Live on-chain Pyth prices ·{" "}
            <a
              href={`${SUIVISION}/${data.find((r) => r.flagship)?.objId ?? data[0].objId}`}
              target="_blank"
              rel="noreferrer"
            >
              Inspect the suiUSDe PriceInfoObject ↗
            </a>
          </p>
          <p className="note">
            suiUSDe is the flagship market — Ethena-backed, live across Sui
            DeFi. Pricing is set off-chain; settlement is objective and
            on-chain. The mainnet pool deploy is pending; the settlement read
            path is proven live.
          </p>
        </>
      )}
    </div>
  );
}
