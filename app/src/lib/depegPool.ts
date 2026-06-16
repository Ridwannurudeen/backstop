import { Transaction } from "@mysten/sui/transactions";
import type { SuiClient } from "@mysten/sui/client";
import {
  SuiPriceServiceConnection,
  SuiPythClient,
} from "@pythnetwork/pyth-sui-js";
import {
  CLOCK,
  HERMES,
  PYTH_DEPEG_COVER_PKG,
  PYTH_DEPEG_POOL,
  PYTH_STATE,
  SUI_TYPE,
  SUIUSDE_FEED_ID,
  WORMHOLE_STATE,
} from "./deployment";

export const MIST_PER_SUI = 1_000_000_000;
export const DEPEG_CONFIG_KEY = "backstop:depeg:mainnet-config";

export type DepegConfig = {
  pkg: string;
  poolId: string;
};

const DEFAULT_DEPEG_CONFIG: DepegConfig = {
  pkg: PYTH_DEPEG_COVER_PKG,
  poolId: PYTH_DEPEG_POOL,
};

export type DepegPoolState = {
  feedIdHex: string;
  thresholdScaled: bigint;
  expoNeg: boolean;
  expoMag: number;
  maxAgeSecs: number;
  premiumBps: number;
  surgePremiumBps: number;
  maxConfBps: number;
  minDwellSecs: number;
  activationDelaySecs: number;
  maxCoverPerPolicyMist: bigint;
  maxTotalCoverMist: bigint;
  treasuryFeeBps: number;
  keeperBountyMist: bigint;
  treasuryMist: bigint;
  paused: boolean;
  timelockSecs: number;
  fundsMist: bigint;
  totalShares: bigint;
  totalCoverMist: bigint;
};

export type DepegPolicy = {
  id: string;
  coverMist: bigint;
  premiumPaidMist: bigint;
  expiryMs: number;
  activationMs: number;
  armed: boolean;
  firstBreachMs: number;
  breached: boolean;
  breachPrice: bigint;
};

export type DepegShare = {
  id: string;
  shares: bigint;
};

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

const objectId = (v: unknown): string => {
  if (typeof v === "string") return v;
  if (isRecord(v) && typeof v.id === "string") return v.id;
  const fields = fieldsOf(v);
  if (typeof fields?.id === "string") return fields.id;
  return "";
};

const feedIdHex = (v: unknown): string => {
  if (Array.isArray(v)) {
    return v.map((n) => Number(n).toString(16).padStart(2, "0")).join("");
  }
  return String(v);
};

export const toMist = (suiAmt: number): bigint =>
  BigInt(Math.round(suiAmt * MIST_PER_SUI));

export const isDepegConfigComplete = (config: DepegConfig): boolean =>
  config.pkg.trim().startsWith("0x") &&
  config.pkg.trim().length > 2 &&
  config.poolId.trim().startsWith("0x") &&
  config.poolId.trim().length > 2;

export function loadDepegConfig(): DepegConfig {
  if (typeof window === "undefined") return DEFAULT_DEPEG_CONFIG;
  const raw = window.localStorage.getItem(DEPEG_CONFIG_KEY);
  if (!raw) return DEFAULT_DEPEG_CONFIG;
  try {
    const parsed = JSON.parse(raw) as Partial<DepegConfig>;
    return {
      pkg:
        typeof parsed.pkg === "string" ? parsed.pkg : DEFAULT_DEPEG_CONFIG.pkg,
      poolId:
        typeof parsed.poolId === "string"
          ? parsed.poolId
          : DEFAULT_DEPEG_CONFIG.poolId,
    };
  } catch {
    window.localStorage.removeItem(DEPEG_CONFIG_KEY);
    return DEFAULT_DEPEG_CONFIG;
  }
}

export function saveDepegConfig(config: DepegConfig): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DEPEG_CONFIG_KEY, JSON.stringify(config));
}

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
    premiumBps: Number(u64(f.premium_bps)),
    surgePremiumBps: Number(u64(f.surge_premium_bps)),
    maxConfBps: Number(u64(f.max_conf_bps)),
    minDwellSecs: Number(u64(f.min_dwell_secs)),
    activationDelaySecs: Number(u64(f.activation_delay_secs)),
    maxCoverPerPolicyMist: u64(f.max_cover_per_policy),
    maxTotalCoverMist: u64(f.max_total_cover),
    treasuryFeeBps: Number(u64(f.treasury_fee_bps)),
    keeperBountyMist: u64(f.keeper_bounty),
    treasuryMist: u64(f.treasury),
    paused: Boolean(f.paused),
    timelockSecs: Number(u64(f.timelock_secs)),
    fundsMist: u64(f.funds),
    totalShares: u64(f.total_shares),
    totalCoverMist: u64(f.total_cover),
  };
}

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

export async function fetchMyDepegPolicies(
  client: SuiClient,
  owner: string,
  pkg: string,
  poolId: string,
): Promise<DepegPolicy[]> {
  const r = await client.getOwnedObjects({
    owner,
    filter: {
      StructType: `${pkg}::pyth_cover_pool::Policy<${SUI_TYPE}>`,
    },
    options: { showContent: true },
  });
  const out: DepegPolicy[] = [];
  for (const o of r.data) {
    const f = (o.data?.content as { fields?: Fields })?.fields;
    if (
      !f ||
      !o.data ||
      objectId(f.pool_id).toLowerCase() !== poolId.toLowerCase()
    ) {
      continue;
    }
    out.push({
      id: o.data.objectId,
      coverMist: u64(f.cover),
      premiumPaidMist: u64(f.premium_paid),
      expiryMs: Number(u64(f.expiry_ms)),
      activationMs: Number(u64(f.activation_ms)),
      armed: Boolean(f.armed),
      firstBreachMs: Number(u64(f.first_breach_ms)),
      breached: Boolean(f.breached),
      breachPrice: u64(f.breach_price),
    });
  }
  return out;
}

export async function fetchMyDepegShares(
  client: SuiClient,
  owner: string,
  pkg: string,
  poolId: string,
): Promise<DepegShare[]> {
  const r = await client.getOwnedObjects({
    owner,
    filter: {
      StructType: `${pkg}::pyth_cover_pool::LpShare<${SUI_TYPE}>`,
    },
    options: { showContent: true },
  });
  const out: DepegShare[] = [];
  for (const o of r.data) {
    const f = (o.data?.content as { fields?: Fields })?.fields;
    if (
      !f ||
      !o.data ||
      objectId(f.pool_id).toLowerCase() !== poolId.toLowerCase()
    ) {
      continue;
    }
    out.push({ id: o.data.objectId, shares: u64(f.shares) });
  }
  return out;
}
