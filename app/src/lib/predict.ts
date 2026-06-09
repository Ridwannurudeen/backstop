import { Transaction } from "@mysten/sui/transactions";
import { bcs } from "@mysten/sui/bcs";
import type { SuiClient } from "@mysten/sui/client";
import {
  PREDICT_PKG,
  PREDICT_OBJ,
  DUSDC,
  CLOCK,
  SERVER,
  QTY_SCALE,
  STRIKE_SCALE,
} from "./ids";

// Verified 2026-06-07 against deepbookv3 @ tlee/predict-workshop (predict.move) + live server:
//   mint/redeem/redeem_permissionless<Quote>(predict, manager, oracle, key, qty, clock)
//   supply<Quote>(predict, coin, clock) -> Coin<PLP>
//   get_trade_amounts(predict, oracle, key, qty, clock) -> (u64, u64)
//   create_manager(ctx) -> ID ; predict_manager::deposit<Quote>(manager, coin)
//   market_key::down|up(oracleId, expiry, strike) -> MarketKey
//   strikes/prices are 1e9-scaled (settled price / 1e9 = realistic BTC $); quantities 1e6-scaled.

const RAW = Number(STRIKE_SCALE); // 1e9

export type Side = "down" | "up";

function marketKey(
  tx: Transaction,
  side: Side,
  oracleId: string,
  expiryMs: bigint,
  strikeUsd: bigint,
) {
  const strike = strikeUsd * STRIKE_SCALE;
  return tx.moveCall({
    target: `${PREDICT_PKG}::market_key::${side}`,
    arguments: [
      tx.pure.id(oracleId),
      tx.pure.u64(expiryMs),
      tx.pure.u64(strike),
    ],
  });
}

// One-time per user: create a (shared) PredictManager. Read the new id from objectChanges after execute.
export function createManagerTx() {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PREDICT_PKG}::predict::create_manager`,
    arguments: [],
  });
  return tx;
}

async function dusdcCoin(
  tx: Transaction,
  client: SuiClient,
  owner: string,
  amount: bigint,
) {
  const { data } = await client.getCoins({ owner, coinType: DUSDC });
  if (!data.length)
    throw new Error("No DUSDC in wallet — request testnet DUSDC first.");
  const primary = tx.object(data[0].coinObjectId);
  if (data.length > 1)
    tx.mergeCoins(
      primary,
      data.slice(1).map((c) => tx.object(c.coinObjectId)),
    );
  const [coin] = tx.splitCoins(primary, [tx.pure.u64(amount)]);
  return coin;
}

export type PolicyParams = {
  owner: string;
  managerId: string;
  oracleId: string;
  expiryMs: bigint;
  strikeUsd: bigint;
  sizeUsd: bigint;
};

// Buy crash protection = mint a DOWN binary (pays out if price < strike at expiry).
export async function buildBuyProtectionTx(client: SuiClient, p: PolicyParams) {
  const qty = p.sizeUsd * QTY_SCALE;
  const tx = new Transaction();
  const coin = await dusdcCoin(tx, client, p.owner, qty);
  tx.moveCall({
    target: `${PREDICT_PKG}::predict_manager::deposit`,
    typeArguments: [DUSDC],
    arguments: [tx.object(p.managerId), coin],
  });
  const key = marketKey(tx, "down", p.oracleId, p.expiryMs, p.strikeUsd);
  tx.moveCall({
    target: `${PREDICT_PKG}::predict::mint`,
    typeArguments: [DUSDC],
    arguments: [
      tx.object(PREDICT_OBJ),
      tx.object(p.managerId),
      tx.object(p.oracleId),
      key,
      tx.pure.u64(qty),
      tx.object(CLOCK),
    ],
  });
  return tx;
}

// Claim a settled policy = redeem_permissionless on the same DOWN key.
export function buildClaimTx(p: Omit<PolicyParams, "owner">) {
  const qty = p.sizeUsd * QTY_SCALE;
  const tx = new Transaction();
  const key = marketKey(tx, "down", p.oracleId, p.expiryMs, p.strikeUsd);
  tx.moveCall({
    target: `${PREDICT_PKG}::predict::redeem_permissionless`,
    typeArguments: [DUSDC],
    arguments: [
      tx.object(PREDICT_OBJ),
      tx.object(p.managerId),
      tx.object(p.oracleId),
      key,
      tx.pure.u64(qty),
      tx.object(CLOCK),
    ],
  });
  return tx;
}

// Underwrite = supply DUSDC to the shared vault, receive PLP (earn premiums from buyers).
export async function buildUnderwriteTx(
  client: SuiClient,
  p: { owner: string; sizeUsd: bigint },
) {
  const amount = p.sizeUsd * QTY_SCALE;
  const tx = new Transaction();
  const coin = await dusdcCoin(tx, client, p.owner, amount);
  const plp = tx.moveCall({
    target: `${PREDICT_PKG}::predict::supply`,
    typeArguments: [DUSDC],
    arguments: [tx.object(PREDICT_OBJ), coin, tx.object(CLOCK)],
  });
  tx.transferObjects([plp], p.owner);
  return tx;
}

// Premium preview (no funds): devInspect get_trade_amounts -> (ask*qty, bid*qty)
// = (cost to mint = premium, current bid value). Verified live 2026-06-07.
// Max payout is the position size itself (a binary pays `quantity` if in-the-money).
export async function quotePremium(
  client: SuiClient,
  p: Omit<PolicyParams, "owner" | "managerId">,
  sender: string,
) {
  const qty = p.sizeUsd * QTY_SCALE;
  const tx = new Transaction();
  const key = marketKey(tx, "down", p.oracleId, p.expiryMs, p.strikeUsd);
  tx.moveCall({
    target: `${PREDICT_PKG}::predict::get_trade_amounts`,
    arguments: [
      tx.object(PREDICT_OBJ),
      tx.object(p.oracleId),
      key,
      tx.pure.u64(qty),
      tx.object(CLOCK),
    ],
  });
  const res = await client.devInspectTransactionBlock({
    sender,
    transactionBlock: tx,
  });
  const rv = res.results?.[res.results.length - 1]?.returnValues;
  if (!rv || rv.length < 2) throw new Error(res.error ?? "no quote returned");
  const premium = BigInt(bcs.u64().parse(Uint8Array.from(rv[0][0]))); // ask*qty = cost to mint
  const bid = BigInt(bcs.u64().parse(Uint8Array.from(rv[1][0]))); // bid*qty = current resale value
  return { premium, bid };
}

export type OracleInfo = {
  oracleId: string;
  expiryMs: bigint;
  minStrikeUsd: number;
  tickUsd: number;
  symbol: string;
};

// Active oracles ARE the available terms — each oracle has one expiry. Sorted soonest-first.
export async function fetchActiveOracles(
  symbol = "BTC",
): Promise<OracleInfo[]> {
  const r = await fetch(`${SERVER}/predicts/${PREDICT_OBJ}/oracles`);
  if (!r.ok) throw new Error(`oracles ${r.status}`);
  const arr = await r.json();
  const list: any[] = Array.isArray(arr) ? arr : [];
  return list
    .filter((o) => o.status === "active" && o.underlying_asset === symbol)
    .map((o) => ({
      oracleId: o.oracle_id as string,
      expiryMs: BigInt(o.expiry),
      minStrikeUsd: Number(o.min_strike) / RAW,
      tickUsd: Number(o.tick_size) / RAW,
      symbol,
    }))
    .sort((a, b) => Number(a.expiryMs - b.expiryMs));
}

// On-Predict reference price: the most recently settled oracle's settlement price.
export async function fetchReferencePrice(
  symbol = "BTC",
): Promise<{ priceUsd: number; asOf: number } | null> {
  const r = await fetch(`${SERVER}/predicts/${PREDICT_OBJ}/oracles`);
  if (!r.ok) return null;
  const arr = await r.json();
  const list: any[] = Array.isArray(arr) ? arr : [];
  const settled = list
    .filter(
      (o) =>
        o.underlying_asset === symbol &&
        o.status === "settled" &&
        Number(o.settlement_price) > 0,
    )
    .sort((a, b) => Number(b.settled_at) - Number(a.settled_at));
  if (!settled.length) return null;
  return {
    priceUsd: Number(settled[0].settlement_price) / RAW,
    asOf: Number(settled[0].settled_at),
  };
}

export type Position = {
  is_up: boolean;
  strike: string;
  expiry: string;
  open_quantity: string;
  mark_price?: string;
  unrealized_pnl?: string;
  oracle_id: string;
  underlying_asset?: string;
  status?: "open" | "active" | "won" | "lost" | string;
  total_payout?: string;
  total_cost?: string;
};

export async function fetchPositions(managerId: string): Promise<Position[]> {
  const r = await fetch(`${SERVER}/managers/${managerId}/positions/summary`);
  if (!r.ok) throw new Error(`positions ${r.status}`);
  const arr = await r.json();
  return (Array.isArray(arr) ? arr : []).filter(
    (p: Position) => Number(p.open_quantity) > 0,
  );
}
