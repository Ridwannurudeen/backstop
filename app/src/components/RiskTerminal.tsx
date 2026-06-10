import { useState } from "react";
import { useCurrentAccount, useSuiClient } from "@mysten/dapp-kit";
import { useQuery } from "@tanstack/react-query";
import {
  fetchActiveOracles,
  fetchReferencePrice,
  quotePremium,
} from "../lib/predict";
import { SERVER } from "../lib/ids";
import { DEFAULT_SYMBOL } from "../lib/markets";
import { usd } from "../lib/format";
import "./terminal.css";

// devInspect needs a sender, but the call is read-only — fall back to the zero
// address when no wallet is connected so the terminal works as a public dashboard.
const ZERO_ADDR = "0x" + "0".repeat(64);

type CurvePoint = { strikeUsd: number; prob: number };

type SviParams = Record<string, number | string>;

async function fetchSvi(oracleId: string): Promise<SviParams | null> {
  const r = await fetch(`${SERVER}/oracles/${oracleId}/svi/latest`);
  if (!r.ok) return null;
  return (await r.json()) as SviParams;
}

function daysTo(ms: bigint) {
  return Math.max(0, Math.round((Number(ms) - Date.now()) / 86_400_000));
}

export default function RiskTerminal() {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const sender = account?.address ?? ZERO_ADDR;

  const { data: oracles } = useQuery({
    queryKey: ["oracles"],
    queryFn: () => fetchActiveOracles(DEFAULT_SYMBOL),
  });
  const { data: ref } = useQuery({
    queryKey: ["refprice"],
    queryFn: () => fetchReferencePrice(DEFAULT_SYMBOL),
  });

  const [oracleIdx, setOracleIdx] = useState(0);
  const oracle = oracles?.[oracleIdx];

  const { data: svi } = useQuery({
    queryKey: ["svi", oracle?.oracleId],
    queryFn: () => fetchSvi(oracle!.oracleId),
    enabled: !!oracle,
  });

  // The crash-probability curve: per-$1 DOWN price across a strike grid.
  // With sizeUsd=1, premium is in micro-DUSDC, so premium/1e6 = price per $1
  // of payout = risk-neutral P(BTC below strike at expiry).
  const { data: curve, isFetching: curveLoading } = useQuery({
    queryKey: ["crash-curve", oracle?.oracleId, ref?.priceUsd, sender],
    enabled: !!oracle && !!ref,
    queryFn: async (): Promise<CurvePoint[]> => {
      const price = ref!.priceUsd;
      const tick = oracle!.tickUsd > 0 ? oracle!.tickUsd : 1;
      const min = oracle!.minStrikeUsd;
      const n = 11;
      const lo = price * 0.5;
      const hi = price * 1.0;
      const seen = new Set<number>();
      const strikes: number[] = [];
      for (let i = 0; i < n; i++) {
        const v = lo + ((hi - lo) * i) / (n - 1);
        let s = Math.round(Math.round(v / tick) * tick);
        if (s < min) s = Math.round(min);
        if (s > 0 && !seen.has(s)) {
          seen.add(s);
          strikes.push(s);
        }
      }
      strikes.sort((a, b) => a - b);
      // allSettled so one strike that aborts (e.g. off-grid / out-of-range)
      // doesn't blank the whole curve.
      const results = await Promise.allSettled(
        strikes.map(async (strikeUsd) => {
          const { premium } = await quotePremium(
            client,
            {
              oracleId: oracle!.oracleId,
              expiryMs: oracle!.expiryMs,
              strikeUsd: BigInt(strikeUsd),
              sizeUsd: 1n,
            },
            sender,
          );
          return { strikeUsd, prob: Number(premium) / 1_000_000 };
        }),
      );
      return results
        .filter(
          (r): r is PromiseFulfilledResult<CurvePoint> =>
            r.status === "fulfilled",
        )
        .map((r) => r.value);
    },
  });

  return (
    <div className="card" id="risk-terminal">
      <h3>Risk terminal — {DEFAULT_SYMBOL} crash surface</h3>
      <p className="muted">
        Live, read-only view of the on-chain volatility surface. The curve is
        priced through DeepBook Predict (DOWN binaries), so each point is the
        market-implied probability that {DEFAULT_SYMBOL} finishes below that
        strike by expiry.
      </p>

      <div className="row">
        <div className="field" style={{ maxWidth: 200 }}>
          <label>Expiry term</label>
          <select
            value={oracleIdx}
            onChange={(e) => setOracleIdx(+e.target.value)}
          >
            {(oracles ?? []).map((o, i) => (
              <option key={o.oracleId} value={i}>
                {daysTo(o.expiryMs)}d
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="term-grid">
        <div className="term-stat">
          <div className="k">Active oracles</div>
          <div className="v">{oracles ? oracles.length : "—"}</div>
        </div>
        <div className="term-stat">
          <div className="k">{DEFAULT_SYMBOL} reference</div>
          <div className="v">{ref ? usd(ref.priceUsd) : "—"}</div>
        </div>
        <div className="term-stat">
          <div className="k">Expiry</div>
          <div className="v">
            {oracle ? `${daysTo(oracle.expiryMs)}d` : "—"}
          </div>
        </div>
        <div className="term-stat">
          <div className="k">Min strike</div>
          <div className="v">{oracle ? usd(oracle.minStrikeUsd) : "—"}</div>
        </div>
        <div className="term-stat">
          <div className="k">Tick size</div>
          <div className="v">{oracle ? usd(oracle.tickUsd) : "—"}</div>
        </div>
      </div>

      <h4 style={{ margin: "8px 0 4px" }}>Implied crash-probability curve</h4>
      {curveLoading && (!curve || curve.length === 0) ? (
        <p className="muted">Pricing strike grid on-chain…</p>
      ) : curve && curve.length > 1 ? (
        <CrashCurve points={curve} symbol={DEFAULT_SYMBOL} />
      ) : (
        <p className="muted">No curve available for this term.</p>
      )}

      <h4 style={{ margin: "20px 0 4px" }}>raw on-chain SVI surface params</h4>
      {svi ? (
        <table className="term-table">
          <tbody>
            {Object.entries(svi).map(([k, v]) => (
              <tr key={k}>
                <td className="k">{k}</td>
                <td className="v">{String(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="muted">No SVI snapshot published for this oracle yet.</p>
      )}
      <p className="note">
        SVI params shown raw (integer-scaled on-chain values) — not rescaled to
        implied vol.
      </p>
    </div>
  );
}

function CrashCurve({
  points,
  symbol,
}: {
  points: CurvePoint[];
  symbol: string;
}) {
  const W = 560;
  const H = 300;
  const m = { top: 16, right: 16, bottom: 36, left: 44 };
  const iw = W - m.left - m.right;
  const ih = H - m.top - m.bottom;

  const xs = points.map((p) => p.strikeUsd);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const spanX = maxX - minX || 1;

  const sx = (s: number) => m.left + ((s - minX) / spanX) * iw;
  const sy = (p: number) => m.top + (1 - p) * ih;

  const line = points.map((p) => `${sx(p.strikeUsd)},${sy(p.prob)}`).join(" ");
  const area =
    `${m.left},${m.top + ih} ` + line + ` ${m.left + iw},${m.top + ih}`;

  const yTicks = [0, 0.25, 0.5, 0.75, 1];
  const xTickIdx = [0, Math.floor(points.length / 2), points.length - 1];

  return (
    <svg className="term-chart" viewBox={`0 0 ${W} ${H}`} role="img">
      {yTicks.map((t) => (
        <g key={t}>
          <line
            className="grid-line"
            x1={m.left}
            x2={m.left + iw}
            y1={sy(t)}
            y2={sy(t)}
          />
          <text className="lbl" x={m.left - 8} y={sy(t) + 3} textAnchor="end">
            {Math.round(t * 100)}%
          </text>
        </g>
      ))}

      <line
        className="axis"
        x1={m.left}
        x2={m.left + iw}
        y1={m.top + ih}
        y2={m.top + ih}
      />

      <polygon className="area" points={area} />
      <polyline className="curve" points={line} />

      {points.map((p) => (
        <circle
          key={p.strikeUsd}
          className="dot"
          cx={sx(p.strikeUsd)}
          cy={sy(p.prob)}
          r={2.5}
        />
      ))}

      {xTickIdx.map((i) => {
        const p = points[i];
        if (!p) return null;
        return (
          <text
            key={i}
            className="lbl"
            x={sx(p.strikeUsd)}
            y={m.top + ih + 16}
            textAnchor="middle"
          >
            {usd(p.strikeUsd)}
          </text>
        );
      })}

      <text className="lbl" x={m.left + iw / 2} y={H - 2} textAnchor="middle">
        {symbol} strike ($) · y = P(below strike at expiry)
      </text>
    </svg>
  );
}
