import { useQuery } from "@tanstack/react-query";
import { useSuiClient } from "@mysten/dapp-kit";
import { fetchSrx } from "../lib/srx";
import { WALRUS_AGGREGATOR, SRX_MARKET } from "../lib/deployment";
import "./terminal.css";

const pct = (bps: number) => `${(bps / 100).toFixed(2)}%`;

export default function SrxIndex() {
  const client = useSuiClient();
  const { data, isLoading } = useQuery({
    queryKey: ["srx", SRX_MARKET],
    queryFn: () => fetchSrx(client),
    refetchInterval: 30_000,
  });

  return (
    <div className="card">
      <h3>
        SRX - the Sui Risk Index{" "}
        <span className="sub">- on-chain, options-implied</span>
      </h3>
      <p className="lead">
        A risk-neutral distribution derived from DeepBook Predict binary
        options, published on-chain by a bonded publisher with Walrus evidence.
        This testnet version still uses admin-resolved challenge logic. Market{" "}
        {SRX_MARKET}.
      </p>

      {isLoading && <p className="muted">Reading the index on-chain...</p>}
      {!isLoading && !data && (
        <div className="unavailable-state">
          <div>
            <span className="section-kicker">Sui testnet lab</span>
            <h4>SRX is not a live production index yet.</h4>
            <p>
              This route is kept for reviewers who want the DeepBook/Walrus
              research surface. It is not shown in primary navigation because no
              meaningful SRX value is currently published.
            </p>
          </div>
          <div className="unavailable-grid">
            <div>
              <span>What SRX measures</span>
              <strong>Market-implied crash, volatility, and tail risk</strong>
            </div>
            <div>
              <span>Required publisher</span>
              <strong>Bonded testnet publisher with Walrus CDF evidence</strong>
            </div>
            <div>
              <span>Current blocker</span>
              <strong>No fresh production-quality reading</strong>
            </div>
            <div>
              <span>Risk boundary</span>
              <strong>
                Admin-resolved challenge logic; not trust-minimized
              </strong>
            </div>
          </div>
          <p className="note">
            Use the mainnet Pyth depeg cover and proof packet for the production
            surface. Treat SRX as a labelled research lane until the publisher,
            challenge, and calibration system are upgraded.
          </p>
        </div>
      )}

      {data && (
        <>
          <div className="term-grid">
            <div className="term-stat">
              <div className="k">SRX-CRASH</div>
              <div className="v">{pct(data.crashBps)}</div>
              <div className="k">P(20%+ drop)</div>
            </div>
            <div className="term-stat">
              <div className="k">SRX-VOL</div>
              <div className="v">{pct(data.volBps)}</div>
              <div className="k">model-free implied vol</div>
            </div>
            <div className="term-stat">
              <div className="k">SRX-TAIL</div>
              <div className="v">{pct(data.tailBps)}</div>
              <div className="k">expected shortfall (5%)</div>
            </div>
            <div className="term-stat">
              <div className="k">Reference</div>
              <div className="v">
                $
                {(data.refPrice / 1e9).toLocaleString("en-US", {
                  maximumFractionDigits: 0,
                })}
              </div>
              <div className="k">BTC, ~30d horizon</div>
            </div>
          </div>

          <p className="muted">
            Bonded publisher -{" "}
            {data.challenged ? "under challenge" : "unchallenged"} -{" "}
            <a
              href={`${WALRUS_AGGREGATOR}/${data.cdfBlob}`}
              target="_blank"
              rel="noreferrer"
            >
              Verify the input CDF on Walrus
            </a>
          </p>
          <p className="note">
            Derived from DeepBook Predict's binary CDF across a strike grid (see
            INDEX.md). Risk-neutral, not a physical forecast: the market's
            priced probability of failure, reproducible from the evidence above.
          </p>
        </>
      )}
    </div>
  );
}
