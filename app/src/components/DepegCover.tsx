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

  const flagship = data?.find((r) => r.flagship);

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

          <h4>Reference consumer</h4>
          <p className="lead">
            <code>pyth_lending_demo</code> — a SUI-reserve lending market that
            buys this exact cover and claims the payout straight into its
            reserve on a breach.{" "}
            {flagship &&
              (flagship.triggered
                ? "suiUSDe is below the floor now, so a holder's payout would latch and settle on-chain."
                : "suiUSDe is above the floor now, so the market keeps its cover active and premiums accrue to LPs; on a breach the payout latches into the reserve in one step.")}
          </p>
          <p className="note">
            An on-chain consumer of the live feed above — 4/4 Move tests, builds
            against mainnet Pyth/Wormhole. Mainnet deploy is pending; the
            settlement read path is proven live.
          </p>
        </>
      )}
    </div>
  );
}
