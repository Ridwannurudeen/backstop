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
        Depeg cover <span className="sub">- settled objectively by Pyth</span>
      </h3>
      <p className="lead">
        Parametric cover on stablecoin exposure. A policy pays from a
        fully-collateralized pool after Pyth's adverse band stays at or below{" "}
        {`$${DEPEG_THRESHOLD.toFixed(3)}`} with confidence at most{" "}
        {DEPEG_MAX_CONF_BPS} bps. Settlement reads Pyth on-chain and follows the
        pool's objective payout rules.
      </p>

      {isLoading && <p className="muted">Reading Pyth on Sui mainnet...</p>}
      {!isLoading && !data?.length && (
        <p className="muted">Mainnet Pyth feeds unavailable - retrying.</p>
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
                    - {ageS}s old
                  </div>
                </div>
              );
            })}
          </div>

          <p className="muted">
            Live on-chain Pyth prices -{" "}
            <a
              href={`${SUIVISION}/${data.find((r) => r.flagship)?.objId ?? data[0].objId}`}
              target="_blank"
              rel="noreferrer"
            >
              Inspect the suiUSDe PriceInfoObject
            </a>
          </p>
          <p className="note">
            suiUSDe is the flagship market - Ethena-backed, live across Sui
            DeFi. Pricing is set by pool terms; settlement is objective and
            on-chain. The current v6 mainnet pool is BuyerCap-restricted, while
            the paid claim proof is archived v3 mechanism-test evidence against
            a separate proof pool.
          </p>

          <h4>Reference consumer</h4>
          <p className="lead">
            <code>pyth_lending_demo</code> is a SUI-reserve lending market that
            buys this cover and claims the payout into its reserve on a breach.{" "}
            {flagship &&
              (flagship.triggered
                ? "suiUSDe's adverse band is below the floor now, so an active policy's breach dwell can latch on-chain."
                : "suiUSDe's adverse band is above the floor now, so the market keeps its cover active and premiums accrue to LPs; on a sustained breach the payout latches into the reserve.")}
          </p>
          <p className="note">
            The lending consumer is deployed against mainnet Pyth/Wormhole and
            covered by Move tests. Its paid-claim evidence is an archived staged
            mechanism test, not a real production depeg event.
          </p>
        </>
      )}
    </div>
  );
}
