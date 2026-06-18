/**
 * @gudman/backstop-sdk - read Backstop's Sui risk primitives in a few lines.
 *
 * Backstop exposes the mainnet Pyth-settled depeg pool plus the older testnet
 * DeepBook/Walrus risk primitives:
 *   - Depeg cover - SUI-collateralized suiUSDe cover settled by Pyth
 *   - SRX - the Sui Risk Index (CRASH / VOL / TAIL), options-implied
 *   - RiskFeed - market-implied probability-of-failure readings
 *
 * Example:
 *   import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
 *   import { readSrx } from "@gudman/backstop-sdk";
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
const BPS = 10_000n;
const PREMIUM_PERIOD_SECS = 2_592_000n;
const DAY_SECS = 86_400;

type Fields = Record<string, unknown>;

const isRecord = (v: unknown): v is Fields =>
  typeof v === "object" && v !== null;

const fieldsOf = (v: unknown): Fields | null => {
  if (!isRecord(v)) return null;
  const fields = v.fields;
  return isRecord(fields) ? fields : null;
};

const u64 = (v: unknown): bigint => {
  if (typeof v === "bigint") return v;
  if (typeof v === "number" || typeof v === "string") return BigInt(v);
  const fields = fieldsOf(v);
  if (fields?.value !== undefined) return u64(fields.value);
  throw new Error("unexpected u64 field");
};

const optionalU64 = (v: unknown): bigint | null =>
  v === undefined ? null : u64(v);

const optionalU64Number = (v: unknown): number | null => {
  const parsed = optionalU64(v);
  return parsed === null ? null : Number(parsed);
};

const feedIdHex = (v: unknown): string => {
  if (Array.isArray(v)) {
    return v.map((n) => Number(n).toString(16).padStart(2, "0")).join("");
  }
  return String(v);
};

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
  /** Maximum accepted Pyth confidence width in basis points. */
  maxConfBps: number;
  /** Required sustained-breach dwell time before claimability. */
  minDwellSecs: number;
  /** Delay before a newly bought policy can be armed. */
  activationDelaySecs: number;
  /** Base premium rate (bps) at 0% utilization; the charged rate is on a curve. */
  premiumBps: number;
  /** Additional premium rate (bps) at 100% utilization. */
  surgePremiumBps: number;
  /** Max cover per policy in MIST (0 = uncapped). */
  maxCoverPerPolicyMist: bigint;
  /** Max policy term in seconds (null on legacy v1 pools). */
  maxPolicyDurationSecs: number | null;
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
  /** Pool-level depeg epoch id (null on pre-epoch pools). */
  epochId: number | null;
  /** True after the first pool-level below-floor read starts dwell. */
  epochArmed: boolean;
  epochFirstBreachMs: number | null;
  /** True once the pool-level dwell has confirmed. */
  epochBreached: boolean;
  epochConfirmedMs: number | null;
  epochBreachPrice: bigint | null;
  fundsMist: bigint;
  totalShares: bigint;
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
  termDays = 30,
): bigint {
  const utilBps =
    pool.fundsMist === 0n
      ? BPS
      : (() => {
          const u = ((pool.totalCoverMist + coverMist) * BPS) / pool.fundsMist;
          return u > BPS ? BPS : u;
        })();
  const rateBps =
    BigInt(pool.premiumBps) + (BigInt(pool.surgePremiumBps) * utilBps) / BPS;
  if (pool.maxPolicyDurationSecs === null) return (coverMist * rateBps) / BPS;
  const durationSecs = BigInt(Math.ceil(termDays * DAY_SECS));
  if (durationSecs <= 0n) return 0n;
  const denom = BPS * PREMIUM_PERIOD_SECS;
  return (coverMist * rateBps * durationSecs + denom - 1n) / denom;
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
  const f = (o.data?.content as { fields?: Fields })?.fields;
  if (!f) throw new Error("depeg pool not found");
  return {
    feedIdHex: feedIdHex(f.feed_id),
    thresholdScaled: u64(f.threshold),
    expoNeg: Boolean(f.expo_neg),
    expoMag: Number(u64(f.expo_mag)),
    maxAgeSecs: Number(u64(f.max_age_secs)),
    maxConfBps: Number(u64(f.max_conf_bps)),
    minDwellSecs: Number(u64(f.min_dwell_secs)),
    activationDelaySecs: Number(u64(f.activation_delay_secs)),
    premiumBps: Number(u64(f.premium_bps)),
    surgePremiumBps: Number(u64(f.surge_premium_bps)),
    maxCoverPerPolicyMist: u64(f.max_cover_per_policy),
    maxPolicyDurationSecs:
      f.max_policy_duration_secs === undefined
        ? null
        : Number(u64(f.max_policy_duration_secs)),
    maxTotalCoverMist: u64(f.max_total_cover),
    treasuryFeeBps: Number(u64(f.treasury_fee_bps)),
    keeperBountyMist: u64(f.keeper_bounty),
    treasuryMist: u64(f.treasury),
    paused: Boolean(f.paused),
    timelockSecs: Number(u64(f.timelock_secs)),
    epochId: optionalU64Number(f.epoch_id),
    epochArmed: Boolean(f.epoch_armed),
    epochFirstBreachMs: optionalU64Number(f.epoch_first_breach_ms),
    epochBreached: Boolean(f.epoch_breached),
    epochConfirmedMs: optionalU64Number(f.epoch_confirmed_ms),
    epochBreachPrice: optionalU64(f.epoch_breach_price),
    fundsMist: u64(f.funds),
    totalShares: u64(f.total_shares),
    totalCoverMist: u64(f.total_cover),
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

async function buildPythUpdateTx(client: SuiClient, feedId: string) {
  const tx = new Transaction();
  const updates = await new SuiPriceServiceConnection(
    HERMES,
  ).getPriceFeedsUpdateData([feedId]);
  const pyth = new SuiPythClient(client, PYTH_STATE, WORMHOLE_STATE);
  const [priceInfoObjectId] = await pyth.updatePriceFeeds(tx, updates, [
    feedId,
  ]);
  return { tx, priceInfoObjectId };
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
  const { tx, priceInfoObjectId } = await buildPythUpdateTx(p.client, feedId);
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

/**
 * Build a tx to record a pool-level breach observation. On epoch-enabled pools,
 * one sustained pool epoch can make all eligible active policies claimable.
 */
export async function buildDepegRecordPoolBreachTx(p: {
  client: SuiClient;
  pkg: string;
  poolId: string;
  feedId?: string;
}): Promise<Transaction> {
  const feedId = p.feedId ?? SUIUSDE_FEED_ID;
  const { tx, priceInfoObjectId } = await buildPythUpdateTx(p.client, feedId);
  tx.moveCall({
    target: `${p.pkg}::pyth_cover_pool::record_pool_breach`,
    typeArguments: [SUI_TYPE],
    arguments: [
      tx.object(p.poolId),
      tx.object(priceInfoObjectId),
      tx.object(CLOCK),
    ],
  });
  return tx;
}

/** Build a tx to close an armed or confirmed pool epoch after Pyth recovery. */
export async function buildDepegRecordPoolRecoveryTx(p: {
  client: SuiClient;
  pkg: string;
  poolId: string;
  feedId?: string;
}): Promise<Transaction> {
  const feedId = p.feedId ?? SUIUSDE_FEED_ID;
  const { tx, priceInfoObjectId } = await buildPythUpdateTx(p.client, feedId);
  tx.moveCall({
    target: `${p.pkg}::pyth_cover_pool::record_pool_recovery`,
    typeArguments: [SUI_TYPE],
    arguments: [
      tx.object(p.poolId),
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

/** Read whether a policy is claimable because of a confirmed pool-level epoch. */
export async function readDepegPolicyClaimableByPoolEpoch(
  client: SuiClient,
  p: {
    pkg: string;
    poolId: string;
    policyId: string;
  },
): Promise<boolean> {
  const tx = new Transaction();
  tx.moveCall({
    target: `${p.pkg}::pyth_cover_pool::policy_claimable_by_pool_epoch`,
    typeArguments: [SUI_TYPE],
    arguments: [tx.object(p.poolId), tx.object(p.policyId)],
  });
  const res = await client.devInspectTransactionBlock({
    sender: ZERO,
    transactionBlock: tx,
  });
  const returned = res.results?.[res.results.length - 1]?.returnValues;
  if (!returned?.[0]) return false;
  return bcs.bool().parse(Uint8Array.from(returned[0][0]));
}

/** Build a tx to release an expired, unlatched policy object. */
export function buildDepegExpirePolicyTx(p: {
  pkg: string;
  poolId: string;
  policyId: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${p.pkg}::pyth_cover_pool::expire_policy`,
    typeArguments: [SUI_TYPE],
    arguments: [tx.object(p.poolId), tx.object(p.policyId), tx.object(CLOCK)],
  });
  return tx;
}

/** Build a tx to permissionlessly sweep an expired, unlatched v2 policy by ID. */
export function buildDepegExpirePolicyByIdTx(p: {
  pkg: string;
  poolId: string;
  policyId: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${p.pkg}::pyth_cover_pool::expire_policy_by_id`,
    typeArguments: [SUI_TYPE],
    arguments: [tx.object(p.poolId), tx.pure.id(p.policyId), tx.object(CLOCK)],
  });
  return tx;
}
