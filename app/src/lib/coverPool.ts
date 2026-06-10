import { Transaction } from "@mysten/sui/transactions";
import { bcs } from "@mysten/sui/bcs";
import type { SuiClient } from "@mysten/sui/client";
import { CLOCK } from "./ids";
import {
  COVER_POOL_PKG,
  COVER_POOL_OBJ,
  COVER_POOL_MARKET,
  RISK_FEED_PKG,
  RISK_FEED_OBJ,
  SUI_TYPE,
} from "./deployment";

// cover_pool::cover_pool (verified against contracts/cover_pool/sources/cover_pool.move):
//   deposit_lp<T>(pool, coin) -> LpShare<T>
//   buy_cover<T>(pool, feed, premium, cover, expiry_ms, clock) -> Policy<T>
//   claim<T>(pool, feed, policy, clock) -> Coin<T>
//   premium_for<T>(pool, feed, cover) -> u64 ; probability_bps(feed, market) -> u64

export type PoolState = {
  market: string;
  triggerBps: number;
  loadingBps: number;
  fundsMist: bigint;
  totalShares: bigint;
  totalCover: bigint;
};

export async function fetchPoolState(client: SuiClient): Promise<PoolState> {
  const o = await client.getObject({
    id: COVER_POOL_OBJ,
    options: { showContent: true },
  });
  const f = (o.data?.content as { fields?: Record<string, string> })?.fields;
  if (!f) throw new Error("cover pool not found");
  return {
    market: f.market,
    triggerBps: Number(f.trigger_bps),
    loadingBps: Number(f.loading_bps),
    fundsMist: BigInt(f.funds),
    totalShares: BigInt(f.total_shares),
    totalCover: BigInt(f.total_cover),
  };
}

function parseU64(
  res: Awaited<ReturnType<SuiClient["devInspectTransactionBlock"]>>,
): bigint {
  const rv = res.results?.[res.results.length - 1]?.returnValues;
  if (!rv?.length) throw new Error(res.error ?? "no value returned");
  return BigInt(bcs.u64().parse(Uint8Array.from(rv[0][0])));
}

// Current market-implied crash probability (bps) for this pool's market.
export async function fetchFeedProbBps(
  client: SuiClient,
  sender: string,
): Promise<number> {
  const tx = new Transaction();
  tx.moveCall({
    target: `${RISK_FEED_PKG}::risk_feed::probability_bps`,
    arguments: [tx.object(RISK_FEED_OBJ), tx.pure.string(COVER_POOL_MARKET)],
  });
  const res = await client.devInspectTransactionBlock({
    sender,
    transactionBlock: tx,
  });
  return Number(parseU64(res));
}

// Exact feed-priced premium (mist) for `coverMist` of cover.
export async function quoteCoverPremium(
  client: SuiClient,
  coverMist: bigint,
  sender: string,
): Promise<bigint> {
  const tx = new Transaction();
  tx.moveCall({
    target: `${COVER_POOL_PKG}::cover_pool::premium_for`,
    typeArguments: [SUI_TYPE],
    arguments: [
      tx.object(COVER_POOL_OBJ),
      tx.object(RISK_FEED_OBJ),
      tx.pure.u64(coverMist),
    ],
  });
  const res = await client.devInspectTransactionBlock({
    sender,
    transactionBlock: tx,
  });
  return parseU64(res);
}

// Provide liquidity: deposit SUI, receive an LpShare.
export function buildDepositLpTx(amountMist: bigint, owner: string) {
  const tx = new Transaction();
  const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(amountMist)]);
  const share = tx.moveCall({
    target: `${COVER_POOL_PKG}::cover_pool::deposit_lp`,
    typeArguments: [SUI_TYPE],
    arguments: [tx.object(COVER_POOL_OBJ), coin],
  });
  tx.transferObjects([share], owner);
  return tx;
}

// Buy parametric cover: pay premium, receive a Policy.
export function buildBuyCoverTx(p: {
  coverMist: bigint;
  premiumMist: bigint;
  expiryMs: bigint;
  owner: string;
}) {
  const tx = new Transaction();
  const [prem] = tx.splitCoins(tx.gas, [tx.pure.u64(p.premiumMist)]);
  const policy = tx.moveCall({
    target: `${COVER_POOL_PKG}::cover_pool::buy_cover`,
    typeArguments: [SUI_TYPE],
    arguments: [
      tx.object(COVER_POOL_OBJ),
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

// Claim a triggered policy: payout settles from the pool.
export function buildClaimTx(policyId: string, owner: string) {
  const tx = new Transaction();
  const payout = tx.moveCall({
    target: `${COVER_POOL_PKG}::cover_pool::claim`,
    typeArguments: [SUI_TYPE],
    arguments: [
      tx.object(COVER_POOL_OBJ),
      tx.object(RISK_FEED_OBJ),
      tx.object(policyId),
      tx.object(CLOCK),
    ],
  });
  tx.transferObjects([payout], owner);
  return tx;
}

export type MyPolicy = {
  id: string;
  coverMist: bigint;
  triggerBps: number;
  expiryMs: number;
};

export async function fetchMyPolicies(
  client: SuiClient,
  owner: string,
): Promise<MyPolicy[]> {
  const r = await client.getOwnedObjects({
    owner,
    filter: {
      StructType: `${COVER_POOL_PKG}::cover_pool::Policy<${SUI_TYPE}>`,
    },
    options: { showContent: true },
  });
  const out: MyPolicy[] = [];
  for (const o of r.data) {
    const f = (o.data?.content as { fields?: Record<string, string> })?.fields;
    if (!f || !o.data) continue;
    out.push({
      id: o.data.objectId,
      coverMist: BigInt(f.cover),
      triggerBps: Number(f.trigger_bps),
      expiryMs: Number(f.expiry_ms),
    });
  }
  return out;
}

// Total LP shares this wallet holds in the pool.
export async function fetchMyShares(
  client: SuiClient,
  owner: string,
): Promise<bigint> {
  const r = await client.getOwnedObjects({
    owner,
    filter: {
      StructType: `${COVER_POOL_PKG}::cover_pool::LpShare<${SUI_TYPE}>`,
    },
    options: { showContent: true },
  });
  return r.data.reduce((sum, o) => {
    const f = (o.data?.content as { fields?: Record<string, string> })?.fields;
    return sum + (f ? BigInt(f.shares) : 0n);
  }, 0n);
}
