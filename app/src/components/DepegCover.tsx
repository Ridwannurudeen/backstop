import { useQuery } from "@tanstack/react-query";
import { fetchDepeg, DEPEG_THRESHOLD, DEPEG_MAX_CONF_BPS } from "../lib/depeg";
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
        fully-collateralized pool after Pyth's adverse band stays at or below{" "}
        {`$${DEPEG_THRESHOLD.toFixed(3)}`} with confidence at most{" "}
        {DEPEG_MAX_CONF_BPS} bps — settlement reads Pyth on-chain, so no one has
        to trust Backstop to get paid.
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
                    {r.triggered
                      ? "adverse band below floor"
                      : `adverse $${r.adversePrice.toFixed(4)}`}{" "}
                    · {ageS}s old
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
            on-chain. The mainnet pool is deployed, and the staged claim path
            has paid out from the pool on-chain.
          </p>

          <h4>Reference consumer</h4>
          <p className="lead">
            <code>pyth_lending_demo</code> — a SUI-reserve lending market that
            buys this exact cover and claims the payout straight into its
            reserve on a breach.{" "}
            {flagship &&
              (flagship.triggered
                ? "suiUSDe's adverse band is below the floor now, so a holder's breach dwell can latch on-chain."
                : "suiUSDe's adverse band is above the floor now, so the market keeps its cover active and premiums accrue to LPs; on a sustained breach the payout latches into the reserve.")}
          </p>
          <p className="note">
            An on-chain consumer of the live feed above — 4/4 Move tests, built
            and deployed against mainnet Pyth/Wormhole, with a live claim paid
            into its reserve.
          </p>
        </>
      )}
    </div>
  );
}
