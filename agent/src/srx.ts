// SRX — compute the Sui Risk Index family from DeepBook Predict's binary CDF and
// publish it on-chain (see INDEX.md for the methodology). Reads DOWN-binary prices
// across a strike grid (the risk-neutral CDF), derives SRX-CRASH / SRX-VOL /
// SRX-TAIL, anchors the input grid to Walrus, and publishes to the risk_index
// oracle as a bonded publisher.
//
// Env: SUI_PRIVATE_KEY (funded — holds/creates the publisher stake). Reads IDs
// from deployment.json.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { bcs } from "@mysten/sui/bcs";
import { NETWORK, CLOCK } from "./ids.js";
import {
  fetchActiveOracles,
  fetchReferencePrice,
  quoteDownPrice,
} from "./pricing.js";
import { logToWalrus } from "./walrus.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const d = JSON.parse(
  readFileSync(join(HERE, "..", "..", "deployment.json"), "utf8"),
);
const YEAR_MS = 365.25 * 86_400_000;
const MIN_BOND = 100_000_000n; // 0.1 SUI

export type CdfPoint = { strikeUsd: number; prob: number };
export type Srx = {
  crashBps: number;
  volBps: number;
  tailBps: number;
  coveredMass: number;
};

// Linear interpolation of the CDF F(K) at an arbitrary strike.
function interp(grid: CdfPoint[], k: number): number {
  if (k <= grid[0].strikeUsd) return grid[0].prob;
  if (k >= grid[grid.length - 1].strikeUsd) return grid[grid.length - 1].prob;
  for (let i = 1; i < grid.length; i++) {
    if (k <= grid[i].strikeUsd) {
      const a = grid[i - 1],
        b = grid[i];
      const t = (k - a.strikeUsd) / (b.strikeUsd - a.strikeUsd);
      return a.prob + t * (b.prob - a.prob);
    }
  }
  return grid[grid.length - 1].prob;
}

// SRX indices from the risk-neutral CDF grid (INDEX.md §3). All inputs in USD;
// horizonMs is time-to-expiry. Returns indices in basis points.
export function computeSrx(
  grid: CdfPoint[],
  refUsd: number,
  horizonMs: number,
): Srx {
  // Enforce a monotone non-decreasing, [0,1]-clamped CDF (isotonic clamp).
  const F: CdfPoint[] = [];
  let prev = 0;
  for (const p of grid) {
    const v = Math.min(1, Math.max(prev, p.prob));
    F.push({ strikeUsd: p.strikeUsd, prob: v });
    prev = v;
  }

  // SRX-CRASH = F(0.8 * ref).
  const crash = interp(F, 0.8 * refUsd);

  // Interval masses + midpoint log-returns for the moment estimators.
  const T = horizonMs / YEAR_MS;
  let mass = 0,
    mu = 0;
  const intervals: { mid: number; x: number; m: number; kmid: number }[] = [];
  for (let i = 1; i < F.length; i++) {
    const m = F[i].prob - F[i - 1].prob;
    if (m <= 0) continue;
    const kmid = (F[i].strikeUsd + F[i - 1].strikeUsd) / 2;
    const x = Math.log(kmid / refUsd);
    intervals.push({ mid: kmid, x, m, kmid });
    mass += m;
    mu += m * x;
  }
  if (mass > 0) mu /= mass;
  let varSum = 0;
  for (const iv of intervals) varSum += iv.m * (iv.x - mu) ** 2;
  const variance = mass > 0 ? varSum / mass : 0;
  const vol = T > 0 ? Math.sqrt(variance / T) : 0; // annualized fraction

  // SRX-TAIL = expected shortfall of the worst 5% (INDEX.md §3).
  // Walk the tail from the bottom, accumulating mass to 0.05, proration included.
  const ALPHA = 0.05;
  let acc = 0,
    esSum = 0;
  // mass below the lowest grid strike is treated as sitting at F[0] (flat extension).
  const belowMass = F[0].prob;
  if (belowMass > 0) {
    const take = Math.min(belowMass, ALPHA);
    esSum += take * Math.max(0, refUsd - F[0].strikeUsd);
    acc += take;
  }
  for (let i = 1; i < F.length && acc < ALPHA; i++) {
    const m = F[i].prob - F[i - 1].prob;
    if (m <= 0) continue;
    const take = Math.min(m, ALPHA - acc);
    const kmid = (F[i].strikeUsd + F[i - 1].strikeUsd) / 2;
    esSum += take * Math.max(0, refUsd - kmid);
    acc += take;
  }
  const es = acc > 0 ? esSum / ALPHA : 0; // USD loss
  const tail = es / refUsd; // fraction of ref

  const bps = (x: number) => Math.max(0, Math.round(x * 10_000));
  return {
    crashBps: bps(crash),
    volBps: bps(vol),
    tailBps: bps(tail),
    coveredMass: mass,
  };
}

async function main(): Promise<void> {
  const k = process.env.SUI_PRIVATE_KEY;
  if (!k) throw new Error("Set SUI_PRIVATE_KEY");
  const RI = d.riskIndex;
  const client = new SuiClient({ url: getFullnodeUrl(NETWORK) });
  const kp = Ed25519Keypair.fromSecretKey(k.trim());
  const addr = kp.getPublicKey().toSuiAddress();

  // Pick the active BTC oracle closest to a 30-day horizon (the canonical index).
  const oracles = await fetchActiveOracles("BTC");
  if (!oracles.length) throw new Error("no active BTC oracles");
  const target = 30 * 86_400_000;
  const oracle = oracles.reduce((best, o) =>
    Math.abs(Number(o.expiryMs) - Date.now() - target) <
    Math.abs(Number(best.expiryMs) - Date.now() - target)
      ? o
      : best,
  );
  const ref = (await fetchReferencePrice("BTC"))?.priceUsd;
  if (!ref) throw new Error("no reference price");
  const horizonMs = Number(oracle.expiryMs) - Date.now();
  const days = Math.max(1, Math.round(horizonMs / 86_400_000));
  console.log(
    `oracle ${oracle.oracleId.slice(0, 10)}… · ${days}d · ref $${ref.toFixed(0)}`,
  );

  // Sample the risk-neutral CDF: DOWN price across a 0.5..1.5 * ref strike grid.
  // Spanning both sides of ref captures the full distribution so SRX-VOL (a moment
  // of the whole density) isn't biased low by a downside-only grid.
  const n = 21;
  const tick = oracle.tickUsd > 0 ? oracle.tickUsd : 1;
  const strikes = new Set<number>();
  for (let i = 0; i < n; i++) {
    const v = ref * (0.5 + (1.0 * i) / (n - 1));
    const s = Math.max(
      oracle.minStrikeUsd,
      Math.round(Math.round(v / tick) * tick),
    );
    if (s > 0) strikes.add(s);
  }
  const sorted = [...strikes].sort((a, b) => a - b);
  const quotes = await Promise.allSettled(
    sorted.map((s) => quoteDownPrice(client, oracle, BigInt(s), addr)),
  );
  const grid: CdfPoint[] = quotes
    .filter(
      (
        q,
      ): q is PromiseFulfilledResult<
        Awaited<ReturnType<typeof quoteDownPrice>>
      > => q.status === "fulfilled",
    )
    .map((q) => ({
      strikeUsd: Number(q.value.strikeUsd),
      prob: q.value.impliedCrashProb,
    }));
  if (grid.length < 4)
    throw new Error(`CDF too sparse (${grid.length} points)`);

  const srx = computeSrx(grid, ref, horizonMs);
  console.log(
    `SRX-CRASH ${(srx.crashBps / 100).toFixed(2)}% · SRX-VOL ${(srx.volBps / 100).toFixed(1)}% · ` +
      `SRX-TAIL ${(srx.tailBps / 100).toFixed(1)}% · covered mass ${(srx.coveredMass * 100).toFixed(0)}%`,
  );

  // Anchor the input grid to Walrus (the reproducibility evidence).
  const evidence = {
    kind: "srx-cdf",
    underlying: "BTC",
    oracleId: oracle.oracleId,
    horizonMs,
    refUsd: ref,
    grid,
    srx,
    ts: new Date().toISOString(),
  };
  const w = await logToWalrus(evidence, 30);
  const blob = w.ok ? w.blobId : "";
  console.log(
    w.ok ? `walrus blob ${blob.slice(0, 12)}…` : `walrus failed: ${w.reason}`,
  );

  // Ensure we're a bonded publisher.
  const stakeTx = new Transaction();
  stakeTx.moveCall({
    target: `${RI.package}::risk_index::stake_bond`,
    arguments: [stakeTx.object(RI.riskIndex), stakeTx.pure.address(addr)],
  });
  const sres = await client.devInspectTransactionBlock({
    sender: addr,
    transactionBlock: stakeTx,
  });
  const staked = BigInt(
    bcs.u64().parse(Uint8Array.from(sres.results![0].returnValues![0][0])),
  );
  const market = "BTC-30D";

  const tx = new Transaction();
  if (staked < MIN_BOND) {
    const [bond] = tx.splitCoins(tx.gas, [tx.pure.u64(MIN_BOND)]);
    tx.moveCall({
      target: `${RI.package}::risk_index::register_publisher`,
      arguments: [
        tx.object(RI.riskIndex),
        tx.pure.string("Backstop SRX"),
        bond,
      ],
    });
  }
  tx.moveCall({
    target: `${RI.package}::risk_index::publish`,
    arguments: [
      tx.object(RI.riskIndex),
      tx.pure.string(market),
      tx.pure.string("BTC"),
      tx.pure.u64(BigInt(horizonMs)),
      tx.pure.u64(BigInt(Math.round(ref * 1e9))),
      tx.pure.u64(BigInt(srx.crashBps)),
      tx.pure.u64(BigInt(srx.volBps)),
      tx.pure.u64(BigInt(srx.tailBps)),
      tx.pure.string(blob),
      tx.object(CLOCK),
    ],
  });
  const out = await client.signAndExecuteTransaction({
    signer: kp,
    transaction: tx,
    options: { showEffects: true },
  });
  console.log(
    `publish ${market}: ${out.effects?.status?.status} · ${out.digest}`,
  );
  if (out.effects?.status?.status !== "success")
    console.log("abort:", out.effects?.status?.error);
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
