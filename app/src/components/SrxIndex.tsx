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
        SRX — the Sui Risk Index{" "}
        <span className="muted" style={{ fontWeight: 400 }}>
          · on-chain, options-implied
        </span>
      </h3>
      <p className="muted">
        Crypto's fear indexes are numbers a website prints. SRX is the market's
        whole risk-neutral distribution, read trustlessly from DeepBook
        Predict's binary options, published on-chain by a <b>bonded</b>{" "}
        publisher with Walrus evidence, and <b>slashable</b> on challenge.
        Market <b>{SRX_MARKET}</b>.
      </p>

      {isLoading && <p className="muted">Reading the index on-chain…</p>}
      {!isLoading && !data && (
        <p className="muted">No SRX reading published yet.</p>
      )}

      {data && (
        <>
          <div className="term-grid">
            <div className="term-stat">
              <div className="k">SRX-CRASH</div>
              <div className="v" style={{ color: "var(--bad)" }}>
                {pct(data.crashBps)}
              </div>
              <div className="k" style={{ marginTop: 4 }}>
                P(≥20% drop)
              </div>
            </div>
            <div className="term-stat">
              <div className="k">SRX-VOL</div>
              <div className="v">{pct(data.volBps)}</div>
              <div className="k" style={{ marginTop: 4 }}>
                model-free implied vol
              </div>
            </div>
            <div className="term-stat">
              <div className="k">SRX-TAIL</div>
              <div className="v">{pct(data.tailBps)}</div>
              <div className="k" style={{ marginTop: 4 }}>
                expected shortfall (5%)
              </div>
            </div>
            <div className="term-stat">
              <div className="k">Reference</div>
              <div className="v">
                $
                {(data.refPrice / 1e9).toLocaleString("en-US", {
                  maximumFractionDigits: 0,
                })}
              </div>
              <div className="k" style={{ marginTop: 4 }}>
                BTC, ~30d horizon
              </div>
            </div>
          </div>

          <p className="muted" style={{ marginTop: 0 }}>
            Published by a bonded publisher ·{" "}
            {data.challenged ? (
              <span style={{ color: "var(--warn)" }}>under challenge</span>
            ) : (
              <span style={{ color: "var(--good)" }}>unchallenged</span>
            )}
            {" · "}
            <a
              href={`${WALRUS_AGGREGATOR}/${data.cdfBlob}`}
              target="_blank"
              rel="noreferrer"
              style={{ color: "var(--accent)", textDecoration: "none" }}
            >
              Verify the input CDF on Walrus ↗
            </a>
          </p>
          <p className="note">
            Derived from DeepBook Predict's binary CDF across a strike grid (see
            INDEX.md). Risk-neutral, not a physical forecast — the market's
            priced probability of failure, reproducible from the evidence above.
          </p>
        </>
      )}
    </div>
  );
}
