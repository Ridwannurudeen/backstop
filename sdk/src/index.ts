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
  SuiPythClient,
  SuiPriceServiceConnection,
} from "@pythnetwork/pyth-sui-js";
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
  HERMES,
  PYTH_STATE,
  WORMHOLE_STATE,
  SUIUSDE_FEED_ID,
  SUIUSDE_PRICE_OBJECT,
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

// --- Depeg cover (Sui MAINNET, settled by Pyth) ---
// Pass a MAINNET SuiClient to these (the rest of the SDK is testnet).

export type DepegReading = {
  priceUsd: number;
  confUsd: number;
  confBps: number;
  adversePriceUsd: number;
  expo: number;
  publishMs: number;
  triggered: boolean; // priceUsd + confUsd <= thresholdUsd and confBps <= maxConfBps
  priceObjectId: string;
};

const i64FromFields = (v: {
  fields: { negative: boolean; magnitude: string };
}): number => (v.fields.negative ? -1 : 1) * Number(v.fields.magnitude);

/**
 * Read a Pyth feed's live on-chain price on Sui mainnet — the exact PriceInfoObject
 * a depeg pool settles against. Defaults to suiUSDe and a $0.985 depeg floor.
 */
export async function readDepegPrice(
  client: SuiClient,
  opts: {
    priceObject?: string;
    thresholdUsd?: number;
    maxConfBps?: number;
  } = {},
): Promise<DepegReading> {
  const priceObjectId = opts.priceObject ?? SUIUSDE_PRICE_OBJECT;
  const thresholdUsd = opts.thresholdUsd ?? 0.985;
  const maxConfBps = opts.maxConfBps ?? 200;
  const o = await client.getObject({
    id: priceObjectId,
    options: { showContent: true },
  });
  const pf = (
    o.data?.content as {
      fields?: {
        price_info?: {
          fields?: { price_feed?: { fields?: { price?: { fields?: any } } } };
        };
      };
    }
  )?.fields?.price_info?.fields?.price_feed?.fields?.price?.fields;
  if (!pf) throw new Error("Pyth PriceInfoObject not found / unexpected shape");
  const expo = i64FromFields(pf.expo);
  const priceUsd = i64FromFields(pf.price) * Math.pow(10, expo);
  const confUsd = Number(pf.conf) * Math.pow(10, expo);
  const confBps = priceUsd > 0 ? (confUsd / priceUsd) * 10_000 : Infinity;
  const adversePriceUsd = priceUsd + confUsd;
  return {
    priceUsd,
    confUsd,
    confBps,
    adversePriceUsd,
    expo,
    publishMs: Number(pf.timestamp) * 1000,
    triggered: adversePriceUsd <= thresholdUsd && confBps <= maxConfBps,
    priceObjectId,
  };
}

export type DepegPoolState = {
  feedIdHex: string;
  thresholdScaled: bigint; // price magnitude at the pool's exponent
  expoNeg: boolean;
  expoMag: number;
  maxAgeSecs: number;
  /** Base premium rate (bps) at 0% utilization; the charged rate is on a curve. */
  premiumBps: number;
  /** Additional premium rate (bps) at 100% utilization. */
  surgePremiumBps: number;
  /** Max cover per policy in MIST (0 = uncapped). */
  maxCoverPerPolicyMist: bigint;
  /** Max aggregate cover in MIST (0 = bounded only by full collateralization). */
  maxTotalCoverMist: bigint;
  /** Protocol fee skimmed from each paid premium, in basis points. */
  treasuryFeeBps: number;
  /** Fixed keeper reward in MIST, paid from treasury on breach confirmation. */
  keeperBountyMist: bigint;
  /** Protocol-owned premium fees in MIST. */
  treasuryMist: bigint;
  /** When true, new deposits/cover are halted (claims are still allowed). */
  paused: boolean;
  /** Governance timelock (seconds) on parameter updates. */
  timelockSecs: number;
  fundsMist: bigint;
  totalCoverMist: bigint;
};

/**
 * Quote the utilization-priced premium (MIST) for `coverMist` against a pool's state:
 * rate = premiumBps + surgePremiumBps * utilization, utilization = (totalCover + cover)
 * / funds (clamped to 1). Mirrors `pyth_cover_pool::premium_for` on-chain.
 */
export function quoteDepegPremium(
  pool: DepegPoolState,
  coverMist: bigint,
): bigint {
  const BPS = 10_000n;
  const utilBps =
    pool.fundsMist === 0n
      ? BPS
      : (() => {
          const u = ((pool.totalCoverMist + coverMist) * BPS) / pool.fundsMist;
          return u > BPS ? BPS : u;
        })();
  const rateBps =
    BigInt(pool.premiumBps) + (BigInt(pool.surgePremiumBps) * utilBps) / BPS;
  return (coverMist * rateBps) / BPS;
}

/** Read a DepegCoverPool's on-chain state (capital, liability, terms). */
export async function readDepegPool(
  client: SuiClient,
  poolId: string,
): Promise<DepegPoolState> {
  const o = await client.getObject({
    id: poolId,
    options: { showContent: true },
  });
  const f = (o.data?.content as { fields?: Record<string, unknown> })?.fields;
  if (!f) throw new Error("depeg pool not found");
  const feed = f.feed_id;
  const feedIdHex = Array.isArray(feed)
    ? feed.map((n) => Number(n).toString(16).padStart(2, "0")).join("")
    : String(feed);
  return {
    feedIdHex,
    thresholdScaled: BigInt(f.threshold as string),
    expoNeg: Boolean(f.expo_neg),
    expoMag: Number(f.expo_mag),
    maxAgeSecs: Number(f.max_age_secs),
    premiumBps: Number(f.premium_bps),
    surgePremiumBps: Number(f.surge_premium_bps),
    maxCoverPerPolicyMist: BigInt(f.max_cover_per_policy as string),
    maxTotalCoverMist: BigInt(f.max_total_cover as string),
    treasuryFeeBps: Number(f.treasury_fee_bps),
    keeperBountyMist: BigInt(f.keeper_bounty as string),
    treasuryMist: BigInt(f.treasury as string),
    paused: Boolean(f.paused),
    timelockSecs: Number(f.timelock_secs),
    fundsMist: BigInt(f.funds as string),
    totalCoverMist: BigInt(f.total_cover as string),
  };
}

/** Build a tx to buy SUI-collateralized depeg cover (premium in MIST). */
export function buildDepegBuyCoverTx(p: {
  pkg: string;
  poolId: string;
  premiumMist: bigint;
  coverMist: bigint;
  expiryMs: bigint;
  owner: string;
}): Transaction {
  const tx = new Transaction();
  const [prem] = tx.splitCoins(tx.gas, [tx.pure.u64(p.premiumMist)]);
  const policy = tx.moveCall({
    target: `${p.pkg}::pyth_cover_pool::buy_cover`,
    typeArguments: [SUI_TYPE],
    arguments: [
      tx.object(p.poolId),
      prem,
      tx.pure.u64(p.coverMist),
      tx.pure.u64(p.expiryMs),
      tx.object(CLOCK),
    ],
  });
  tx.transferObjects([policy], p.owner);
  return tx;
}

/** Build a tx to supply SUI liquidity to a depeg pool and receive an LP share. */
export function buildDepegDepositLpTx(p: {
  pkg: string;
  poolId: string;
  amountMist: bigint;
  owner: string;
}): Transaction {
  const tx = new Transaction();
  const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(p.amountMist)]);
  const share = tx.moveCall({
    target: `${p.pkg}::pyth_cover_pool::deposit_lp`,
    typeArguments: [SUI_TYPE],
    arguments: [tx.object(p.poolId), coin],
  });
  tx.transferObjects([share], p.owner);
  return tx;
}

/** Build a tx to redeem one depeg LP share object for its pool value. */
export function buildDepegWithdrawLpTx(p: {
  pkg: string;
  poolId: string;
  shareId: string;
  owner: string;
}): Transaction {
  const tx = new Transaction();
  const payout = tx.moveCall({
    target: `${p.pkg}::pyth_cover_pool::withdraw_lp`,
    typeArguments: [SUI_TYPE],
    arguments: [tx.object(p.poolId), tx.object(p.shareId)],
  });
  tx.transferObjects([payout], p.owner);
  return tx;
}

/**
 * Build a tx to **record a sub-threshold observation** on a policy: refreshes Pyth
 * and, if the feed is below its floor, advances the policy's dwell latch. Settlement
 * requires a SUSTAINED breach, so a keeper calls this twice — once to arm the dwell,
 * then again at least `min_dwell_secs` later to confirm — after which the policy is
 * claimable via {@link buildDepegClaimLatchedTx}, even once the price recovers or the
 * policy expires. There is no single-read instant claim. Requires a mainnet `client`.
 */
export async function buildDepegRecordBreachTx(p: {
  client: SuiClient;
  pkg: string;
  poolId: string;
  policyId: string;
  feedId?: string;
}): Promise<Transaction> {
  const feedId = p.feedId ?? SUIUSDE_FEED_ID;
  const tx = new Transaction();
  const updates = await new SuiPriceServiceConnection(
    HERMES,
  ).getPriceFeedsUpdateData([feedId]);
  const pyth = new SuiPythClient(p.client, PYTH_STATE, WORMHOLE_STATE);
  const [priceInfoObjectId] = await pyth.updatePriceFeeds(tx, updates, [
    feedId,
  ]);
  tx.moveCall({
    target: `${p.pkg}::pyth_cover_pool::record_breach`,
    typeArguments: [SUI_TYPE],
    arguments: [
      tx.object(p.poolId),
      tx.object(p.policyId),
      tx.object(priceInfoObjectId),
      tx.object(CLOCK),
    ],
  });
  return tx;
}

/** Build a tx to claim a previously-latched policy (no Pyth read needed). */
export function buildDepegClaimLatchedTx(p: {
  pkg: string;
  poolId: string;
  policyId: string;
  owner: string;
}): Transaction {
  const tx = new Transaction();
  const payout = tx.moveCall({
    target: `${p.pkg}::pyth_cover_pool::claim_latched`,
    typeArguments: [SUI_TYPE],
    arguments: [tx.object(p.poolId), tx.object(p.policyId)],
  });
  tx.transferObjects([payout], p.owner);
  return tx;
}
