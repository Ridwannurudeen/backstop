/**
 * @backstop/sdk — read Sui's on-chain risk layer in a few lines.
 *
 * Backstop publishes risk as a public good on Sui testnet (over DeepBook Predict):
 *   • SRX — the Sui Risk Index (CRASH / VOL / TAIL), options-implied
 *   • RiskFeed — a market-implied probability-of-failure oracle any contract reads
 *   • Cover pools — parametric crash cover, claims settle on DeepBook's own oracle
 *
 * Example:
 *   import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
 *   import { readSrx } from "@backstop/sdk";
 *   const client = new SuiClient({ url: getFullnodeUrl("testnet") });
 *   const srx = await readSrx(client);   // { crashBps, volBps, tailBps, ... }
 */
import { Transaction } from "@mysten/sui/transactions";
import { bcs } from "@mysten/sui/bcs";
import type { SuiClient } from "@mysten/sui/client";
import {
  RISK_INDEX_PKG,
  RISK_INDEX_OBJ,
  RISK_FEED_PKG,
  RISK_FEED_OBJ,
  COVER_POOL_PKG,
  ORACLE_POOL_PKG,
  SUI_TYPE,
  CLOCK,
  WALRUS_AGGREGATOR,
} from "./deployment.js";

export * from "./deployment.js";

const ZERO = "0x" + "0".repeat(64);

export type SrxReading = {
  crashBps: number; // P(>=20% drawdown), basis points
  volBps: number; // model-free implied volatility, bps
  tailBps: number; // expected shortfall (5%), bps of reference
  refPriceUsd: number;
  cdfBlobUrl: string; // Walrus URL: the input CDF evidence, reproducible
  challenged: boolean;
};

/** Read the latest SRX index for a market (default the BTC ~30-day benchmark). */
export async function readSrx(
  client: SuiClient,
  market = "BTC-30D",
): Promise<SrxReading | null> {
  const idx = await client.getObject({
    id: RISK_INDEX_OBJ,
    options: { showContent: true },
  });
  const tableId = (
    idx.data?.content as {
      fields?: { readings?: { fields?: { id?: { id?: string } } } };
    }
  )?.fields?.readings?.fields?.id?.id;
  if (!tableId) return null;
  let field;
  try {
    field = await client.getDynamicFieldObject({
      parentId: tableId,
      name: { type: "0x1::string::String", value: market },
    });
  } catch {
    return null;
  }
  const f = (
    field.data?.content as {
      fields?: { value?: { fields?: Record<string, string> } };
    }
  )?.fields?.value?.fields;
  if (!f) return null;
  return {
    crashBps: Number(f.srx_crash_bps),
    volBps: Number(f.srx_vol_bps),
    tailBps: Number(f.srx_tail_bps),
    refPriceUsd: Number(f.ref_price) / 1e9,
    cdfBlobUrl: `${WALRUS_AGGREGATOR}/${f.cdf_blob}`,
    challenged: Boolean(f.challenged),
  };
}

/** Read the RiskFeed's market-implied probability of failure (basis points). */
export async function readCrashProbabilityBps(
  client: SuiClient,
  market: string,
  sender = ZERO,
): Promise<number> {
  const tx = new Transaction();
  tx.moveCall({
    target: `${RISK_FEED_PKG}::risk_feed::probability_bps`,
    arguments: [tx.object(RISK_FEED_OBJ), tx.pure.string(market)],
  });
  const res = await client.devInspectTransactionBlock({
    sender,
    transactionBlock: tx,
  });
  const rv = res.results?.[res.results.length - 1]?.returnValues;
  if (!rv?.length) throw new Error(res.error ?? "no reading for market");
  return Number(bcs.u64().parse(Uint8Array.from(rv[0][0])));
}

export type PoolState = {
  market: string;
  triggerBps: number;
  fundsMist: bigint;
  totalCoverMist: bigint;
};

/** Read a cover pool's state (TVL, outstanding cover, trigger). */
export async function readCoverPool(
  client: SuiClient,
  poolId: string,
): Promise<PoolState> {
  const o = await client.getObject({
    id: poolId,
    options: { showContent: true },
  });
  const f = (o.data?.content as { fields?: Record<string, string> })?.fields;
  if (!f) throw new Error("cover pool not found");
  return {
    market: f.market,
    triggerBps: Number(f.trigger_bps),
    fundsMist: BigInt(f.funds),
    totalCoverMist: BigInt(f.total_cover),
  };
}

/** Build a tx to buy parametric cover from a cover pool (premium in MIST). */
export function buildBuyCoverTx(p: {
  poolId: string;
  premiumMist: bigint;
  coverMist: bigint;
  expiryMs: bigint;
  owner: string;
}): Transaction {
  const tx = new Transaction();
  const [prem] = tx.splitCoins(tx.gas, [tx.pure.u64(p.premiumMist)]);
  const policy = tx.moveCall({
    target: `${COVER_POOL_PKG}::cover_pool::buy_cover`,
    typeArguments: [SUI_TYPE],
    arguments: [
      tx.object(p.poolId),
      tx.object(RISK_FEED_OBJ),
      prem,
      tx.pure.u64(p.coverMist),
      tx.pure.u64(p.expiryMs),
      tx.object(CLOCK),
    ],
  });
  tx.transferObjects([policy], p.owner);
  return tx;
}

/**
 * Build a tx to claim a cover policy whose pool settles **trustlessly on DeepBook's
 * own oracle** — pass the bound `OracleSVI` object id.
 */
export function buildTrustlessClaimTx(p: {
  poolId: string;
  oracleId: string;
  policyId: string;
  owner: string;
}): Transaction {
  const tx = new Transaction();
  const payout = tx.moveCall({
    target: `${ORACLE_POOL_PKG}::oracle_pool::claim`,
    typeArguments: [SUI_TYPE],
    arguments: [
      tx.object(p.poolId),
      tx.object(p.oracleId),
      tx.object(p.policyId),
    ],
  });
  tx.transferObjects([payout], p.owner);
  return tx;
}
