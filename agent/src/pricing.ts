import { Transaction } from "@mysten/sui/transactions";
import { bcs } from "@mysten/sui/bcs";
import type { SuiClient } from "@mysten/sui/client";
import {
  PREDICT_PKG,
  PREDICT_OBJ,
  CLOCK,
  SERVER,
  QTY_SCALE,
  STRIKE_SCALE,
} from "./ids.js";

// get_trade_amounts pattern verified live against deepbookv3 @ tlee/predict-workshop:
//   market_key::down(oracleId, expiry, strike*1e9) -> MarketKey
//   predict::get_trade_amounts(predict, oracle, key, qty, clock) -> (ask*qty, bid*qty)
// devInspect needs no funds — any sender address works.

const RAW = Number(STRIKE_SCALE); // 1e9

export type OracleInfo = {
  oracleId: string;
  expiryMs: bigint;
  minStrikeUsd: number;
  tickUsd: number;
  symbol: string;
};

// Active oracles ARE the available terms — each oracle has one expiry. Soonest-first.
export async function fetchActiveOracles(
  symbol = "BTC",
): Promise<OracleInfo[]> {
  const r = await fetch(`${SERVER}/predicts/${PREDICT_OBJ}/oracles`);
  if (!r.ok) throw new Error(`oracles ${r.status}`);
  const list: any[] = await r.json();
  return (Array.isArray(list) ? list : [])
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
  const list: any[] = await r.json();
  const settled = (Array.isArray(list) ? list : [])
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

// SVI volatility-surface snapshot for one oracle. Returns null if unavailable.
export async function fetchSvi(oracleId: string): Promise<unknown | null> {
  const r = await fetch(`${SERVER}/oracles/${oracleId}/svi/latest`);
  if (!r.ok) return null;
  return r.json().catch(() => null);
}

// Pick a crash-protection strike: ~10% below reference, snapped to tick, floored at min.
export function pickCrashStrikeUsd(
  refPriceUsd: number | null,
  o: OracleInfo,
): bigint {
  const tick = o.tickUsd > 0 ? o.tickUsd : 1;
  if (refPriceUsd && refPriceUsd > o.minStrikeUsd) {
    const target = refPriceUsd * 0.9;
    const snapped = Math.floor(target / tick) * tick;
    const clamped = Math.max(snapped, o.minStrikeUsd);
    return BigInt(Math.round(clamped));
  }
  return BigInt(Math.round(o.minStrikeUsd));
}

export type DownQuote = {
  strikeUsd: bigint;
  sizeUsd: bigint;
  premiumRaw: bigint; // ask*qty (cost to buy protection)
  bidRaw: bigint; // bid*qty (current resale value)
  impliedCrashProb: number; // premium / qty, in [0,1]
};

// devInspect get_trade_amounts on a DOWN binary. Price-per-unit = implied crash probability.
export async function quoteDownPrice(
  client: SuiClient,
  o: OracleInfo,
  strikeUsd: bigint,
  sender: string,
  sizeUsd = 1000n,
): Promise<DownQuote> {
  const qty = sizeUsd * QTY_SCALE;
  const tx = new Transaction();
  const key = tx.moveCall({
    target: `${PREDICT_PKG}::market_key::down`,
    arguments: [
      tx.pure.id(o.oracleId),
      tx.pure.u64(o.expiryMs),
      tx.pure.u64(strikeUsd * STRIKE_SCALE),
    ],
  });
  tx.moveCall({
    target: `${PREDICT_PKG}::predict::get_trade_amounts`,
    arguments: [
      tx.object(PREDICT_OBJ),
      tx.object(o.oracleId),
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
  if (!rv || rv.length < 2)
    throw new Error(res.error ?? "no quote returned from get_trade_amounts");
  const premiumRaw = BigInt(bcs.u64().parse(Uint8Array.from(rv[0][0])));
  const bidRaw = BigInt(bcs.u64().parse(Uint8Array.from(rv[1][0])));
  const impliedCrashProb = Number(premiumRaw) / Number(qty);
  return { strikeUsd, sizeUsd, premiumRaw, bidRaw, impliedCrashProb };
}
