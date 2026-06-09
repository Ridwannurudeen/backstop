import { Transaction } from "@mysten/sui/transactions";
import type { SuiClient } from "@mysten/sui/client";
import {
  PREDICT_PKG,
  PREDICT_OBJ,
  DUSDC,
  CLOCK,
  QTY_SCALE,
  STRIKE_SCALE,
} from "./ids";

// Treasury holdings + basket crash-protection, built on the same verified
// DeepBook Predict primitives as predict.ts (deposit + market_key::down + predict::mint).

export type Holding = {
  coinType: string;
  symbol: string; // last path segment of the coin type
  raw: bigint; // on-chain total balance (smallest units)
};

// All coins held by `owner`, with a human symbol pulled from the type tag.
export async function fetchHoldings(
  client: SuiClient,
  owner: string,
): Promise<Holding[]> {
  const balances = await client.getAllBalances({ owner });
  return balances.map((b) => ({
    coinType: b.coinType,
    symbol: b.coinType.split("::").pop() ?? b.coinType,
    raw: BigInt(b.totalBalance),
  }));
}

export type TreasuryLine = {
  symbol: string;
  coinType: string;
  raw: bigint;
  usd: number; // estimated value (0 when not priceable)
  valued: boolean; // false for unknown assets we list but can't price
};

export type TreasuryEstimate = { totalUsd: number; lines: TreasuryLine[] };

const isStable = (s: string) => /USDC|USDT|DUSDC/i.test(s);
const isBtc = (s: string) => /BTC/i.test(s);

// Stablecoins are valued at $1 with 1e6 decimals. BTC-like holdings are counted
// at the on-Predict reference price (9 decimals, the Sui-native convention).
// Anything else is listed but left unpriced so the user still sees it.
export function estimateTreasuryUsd(
  holdings: Holding[],
  btcRefUsd: number,
): TreasuryEstimate {
  let totalUsd = 0;
  const lines = holdings.map((h): TreasuryLine => {
    let usd = 0;
    let valued = false;
    if (isStable(h.symbol)) {
      usd = Number(h.raw) / 1_000_000;
      valued = true;
    } else if (isBtc(h.symbol)) {
      usd = (Number(h.raw) / 1_000_000_000) * btcRefUsd;
      valued = true;
    }
    if (valued) totalUsd += usd;
    return {
      symbol: h.symbol,
      coinType: h.coinType,
      raw: h.raw,
      usd,
      valued,
    };
  });
  return { totalUsd, lines };
}

export type BasketLeg = { strikeUsd: bigint; sizeUsd: bigint };

export type BasketParams = {
  owner: string;
  managerId: string;
  oracleId: string;
  expiryMs: bigint;
  legs: BasketLeg[];
};

// One programmable transaction that buys a whole basket of DOWN binaries:
// pull DUSDC once, deposit the summed size once, then mint each leg at its own
// strike. Mirrors buildBuyProtectionTx's move calls, batched.
export async function buildBasketProtectionTx(
  client: SuiClient,
  p: BasketParams,
): Promise<Transaction> {
  if (!p.legs.length) throw new Error("Basket has no legs.");
  const qtys = p.legs.map((l) => l.sizeUsd * QTY_SCALE);
  const total = qtys.reduce((a, b) => a + b, 0n);

  const tx = new Transaction();

  // Fetch DUSDC once and split the total deposit out of it.
  const { data } = await client.getCoins({ owner: p.owner, coinType: DUSDC });
  if (!data.length)
    throw new Error("No DUSDC in wallet — request testnet DUSDC first.");
  const primary = tx.object(data[0].coinObjectId);
  if (data.length > 1)
    tx.mergeCoins(
      primary,
      data.slice(1).map((c) => tx.object(c.coinObjectId)),
    );
  const [coin] = tx.splitCoins(primary, [tx.pure.u64(total)]);

  // Deposit the whole basket's worth into the manager once.
  tx.moveCall({
    target: `${PREDICT_PKG}::predict_manager::deposit`,
    typeArguments: [DUSDC],
    arguments: [tx.object(p.managerId), coin],
  });

  // Mint each leg as a DOWN binary at its strike.
  p.legs.forEach((leg, i) => {
    const strike = leg.strikeUsd * STRIKE_SCALE;
    const key = tx.moveCall({
      target: `${PREDICT_PKG}::market_key::down`,
      arguments: [
        tx.pure.id(p.oracleId),
        tx.pure.u64(p.expiryMs),
        tx.pure.u64(strike),
      ],
    });
    tx.moveCall({
      target: `${PREDICT_PKG}::predict::mint`,
      typeArguments: [DUSDC],
      arguments: [
        tx.object(PREDICT_OBJ),
        tx.object(p.managerId),
        tx.object(p.oracleId),
        key,
        tx.pure.u64(qtys[i]),
        tx.object(CLOCK),
      ],
    });
  });

  return tx;
}
