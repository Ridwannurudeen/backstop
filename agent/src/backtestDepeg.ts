// Replay Backstop's Pyth-settled depeg trigger over a historical Pyth Benchmarks
// window. Default window is the Oct-2025 USDe dislocation; no funds or Sui RPC needed.
//
// Run: npm run backtest-depeg
const BENCHMARKS = "https://benchmarks.pyth.network";

type Feed = {
  label: string;
  symbol: string;
  id: string;
};

type Bar = {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

type OracleTick = {
  ts: number;
  priceUsd: number;
  confUsd: number;
  confBps: number;
};

type LatchResult = {
  armedAt?: OracleTick;
  confirmedAt?: OracleTick;
  confirmed: boolean;
};

const FEEDS: Feed[] = [
  {
    label: "USDE/USD",
    symbol: "Crypto.USDE/USD",
    id: "6ec879b1e9963de5ee97e9c8710b742d6228252a5e2ca12d4ae81d7fe5ee8c5d",
  },
  {
    label: "SUIUSDE/USD",
    symbol: "Crypto.SUIUSDE/USD",
    id: "8cead549d0e770dea8fdf5e018a85d59585265cf8bff16ba83962fc7996dbb7f",
  },
];

const fromIso = process.env.FROM ?? "2025-10-10T00:00:00Z";
const toIso = process.env.TO ?? "2025-10-12T00:00:00Z";
const thresholdUsd = Number(process.env.THRESHOLD_USD ?? "0.985");
const maxConfBps = Number(process.env.MAX_CONF_BPS ?? "200");
const minDwellSecs = Number(process.env.MIN_DWELL_SECS ?? "600");
const activationDelaySecs = Number(process.env.ACTIVATION_DELAY_SECS ?? "1800");
const maxConfWindows = Number(process.env.MAX_CONF_WINDOWS ?? "24");

const from = Math.floor(Date.parse(fromIso) / 1000);
const to = Math.floor(Date.parse(toIso) / 1000);

function asRecord(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) {
    throw new Error("unexpected response shape");
  }
  return v as Record<string, unknown>;
}

function maybeRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function numberArray(r: Record<string, unknown>, key: string): number[] {
  const raw = r[key];
  if (!Array.isArray(raw)) throw new Error(`missing array ${key}`);
  return raw.map((v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) throw new Error(`bad number in ${key}`);
    return n;
  });
}

function stableUrl(path: string, params: Record<string, string>): string {
  const search = new URLSearchParams(params);
  return `${BENCHMARKS}${path}?${search.toString()}`;
}

async function fetchJson(url: string): Promise<unknown> {
  let delayMs = 1200;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const res = await fetch(url);
    if (res.ok) return res.json();
    if (res.status !== 429 && res.status < 500) {
      throw new Error(`${url} -> ${res.status}`);
    }

    const retryAfter = Number(res.headers.get("retry-after"));
    const waitMs = Number.isFinite(retryAfter)
      ? Math.max(delayMs, retryAfter * 1000)
      : delayMs;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    delayMs *= 2;
  }
  throw new Error(`${url} -> rate limit after retries`);
}

async function readJson(url: string): Promise<Record<string, unknown>> {
  return asRecord(await fetchJson(url));
}

async function fetchHistory(feed: Feed): Promise<Bar[]> {
  const data = await readJson(
    stableUrl("/v1/shims/tradingview/history", {
      symbol: feed.symbol,
      resolution: "1",
      from: String(from),
      to: String(to),
    }),
  );
  const status = String(data.s ?? "");
  if (status !== "ok")
    throw new Error(`${feed.label} history status ${status}`);
  const t = numberArray(data, "t");
  const o = numberArray(data, "o");
  const h = numberArray(data, "h");
  const l = numberArray(data, "l");
  const c = numberArray(data, "c");
  return t.map((ts, i) => ({
    ts,
    open: o[i],
    high: h[i],
    low: l[i],
    close: c[i],
  }));
}

function parseParsedPrice(v: unknown): OracleTick | null {
  const row = maybeRecord(v);
  const p = row ? maybeRecord(row.price) : null;
  if (!p) return null;
  const price = Number(p.price);
  const conf = Number(p.conf);
  const expo = Number(p.expo);
  const ts = Number(p.publish_time);
  if (![price, conf, expo, ts].every(Number.isFinite)) return null;
  const scale = Math.pow(10, expo);
  const priceUsd = price * scale;
  const confUsd = conf * scale;
  return {
    ts,
    priceUsd,
    confUsd,
    confBps: priceUsd > 0 ? (confUsd / priceUsd) * 10_000 : Infinity,
  };
}

async function fetchIntervalTicks(
  feed: Feed,
  ts: number,
): Promise<OracleTick[]> {
  const raw = await fetchJson(
    stableUrl(`/v1/updates/price/${ts}/60`, { ids: feed.id }),
  );
  const data = maybeRecord(raw);
  const envelopes = Array.isArray(raw)
    ? raw
    : Array.isArray(data?.value)
      ? data.value
      : data
        ? [data]
        : [];
  const out: OracleTick[] = [];
  for (const envelope of envelopes) {
    const parsed = maybeRecord(envelope)?.parsed;
    if (!Array.isArray(parsed)) continue;
    for (const row of parsed) {
      const tick = parseParsedPrice(row);
      if (tick) out.push(tick);
    }
  }
  return out;
}

function qualifies(tick: OracleTick): boolean {
  return (
    tick.priceUsd + tick.confUsd <= thresholdUsd && tick.confBps <= maxConfBps
  );
}

function replayLatch(
  ticks: OracleTick[],
  activationTs: number,
  dwellSecs: number,
): LatchResult {
  let armedAt: OracleTick | undefined;
  for (const tick of ticks) {
    if (tick.ts < activationTs || !qualifies(tick)) continue;
    if (!armedAt) {
      armedAt = tick;
    } else if (tick.ts >= armedAt.ts + dwellSecs) {
      return { armedAt, confirmedAt: tick, confirmed: true };
    }
  }
  return { armedAt, confirmed: false };
}

function fmtUsd(n: number): string {
  return `$${n.toFixed(6)}`;
}

function fmtTime(ts: number | undefined): string {
  return ts ? new Date(ts * 1000).toISOString() : "n/a";
}

function printResult(label: string, result: LatchResult): void {
  const armed = result.armedAt;
  const confirmed = result.confirmedAt;
  console.log(
    `    ${label.padEnd(24)} ${result.confirmed ? "PAYS" : "no payout"}`,
  );
  console.log(
    `      arm=${fmtTime(armed?.ts)} confirm=${fmtTime(confirmed?.ts)}`,
  );
}

async function analyze(feed: Feed): Promise<void> {
  const bars = await fetchHistory(feed);
  console.log(`\n${feed.label} (${feed.symbol})`);
  if (!bars.length) {
    console.log("  no Pyth Benchmarks bars in this window");
    return;
  }

  const minLow = bars.reduce((best, bar) => (bar.low < best.low ? bar : best));
  const minClose = bars.reduce((best, bar) =>
    bar.close < best.close ? bar : best,
  );
  const candidateBars = bars.filter((bar) => bar.low <= thresholdUsd);

  console.log(`  bars              : ${bars.length}`);
  console.log(
    `  min low           : ${fmtUsd(minLow.low)} @ ${fmtTime(minLow.ts)}`,
  );
  console.log(
    `  min close         : ${fmtUsd(minClose.close)} @ ${fmtTime(minClose.ts)}`,
  );
  console.log(`  low <= threshold  : ${candidateBars.length} minute bar(s)`);

  if (!candidateBars.length) return;
  if (candidateBars.length > maxConfWindows) {
    console.log(
      `  skipped conf replay: ${candidateBars.length} candidate windows exceeds MAX_CONF_WINDOWS=${maxConfWindows}`,
    );
    return;
  }

  const tickGroups: OracleTick[][] = [];
  for (const bar of candidateBars) {
    tickGroups.push(await fetchIntervalTicks(feed, bar.ts));
  }
  const ticks = tickGroups
    .flat()
    .filter((tick, i, all) => all.findIndex((t) => t.ts === tick.ts) === i)
    .sort((a, b) => a.ts - b.ts);
  const adverseTicks = ticks.filter(qualifies);

  console.log(`  conf replay ticks : ${ticks.length}`);
  if (ticks.length) {
    const worstRaw = ticks.reduce((best, tick) =>
      tick.priceUsd + tick.confUsd < best.priceUsd + best.confUsd ? tick : best,
    );
    console.log(
      `  min point+conf    : ${fmtUsd(worstRaw.priceUsd)} + conf ${fmtUsd(worstRaw.confUsd)} = ${fmtUsd(worstRaw.priceUsd + worstRaw.confUsd)} @ ${fmtTime(worstRaw.ts)}`,
    );
  }
  console.log(`  adverse ticks     : ${adverseTicks.length}`);
  if (!adverseTicks.length) return;

  const first = adverseTicks[0];
  const last = adverseTicks[adverseTicks.length - 1];
  const worst = adverseTicks.reduce((best, tick) =>
    tick.priceUsd + tick.confUsd < best.priceUsd + best.confUsd ? tick : best,
  );
  console.log(
    `  adverse window    : ${fmtTime(first.ts)} -> ${fmtTime(last.ts)} (${last.ts - first.ts}s)`,
  );
  console.log(
    `  worst adverse     : ${fmtUsd(worst.priceUsd)} + conf ${fmtUsd(worst.confUsd)} = ${fmtUsd(worst.priceUsd + worst.confUsd)}`,
  );

  printResult(
    "already-active policy",
    replayLatch(adverseTicks, from, minDwellSecs),
  );
  printResult(
    "bought at first tick",
    replayLatch(adverseTicks, first.ts + activationDelaySecs, minDwellSecs),
  );
}

async function main(): Promise<void> {
  console.log("Backstop depeg trigger backtest (Pyth Benchmarks)");
  console.log(`window            : ${fromIso} -> ${toIso}`);
  console.log(`threshold         : ${fmtUsd(thresholdUsd)}`);
  console.log(`max_conf_bps      : ${maxConfBps}`);
  console.log(`min_dwell_secs    : ${minDwellSecs}`);
  console.log(`activation_delay  : ${activationDelaySecs}`);
  console.log(
    "note              : TradingView bars find candidate minutes; per-second Pyth updates replay confidence only inside those windows.",
  );

  for (const feed of FEEDS) {
    await analyze(feed);
  }
}

main().catch((e) => {
  console.error("FAILED:", (e as Error).message ?? e);
  process.exit(1);
});
