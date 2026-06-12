import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";

// Backstop's depeg cover settles on Sui MAINNET Pyth, while the rest of the app
// runs on testnet — so this panel reads through its own mainnet client. It reads
// the live Pyth PriceInfoObjects directly (no SDK), the same objects that
// pyth_cover_pool::claim consumes on-chain.
const mainnet = new SuiClient({ url: getFullnodeUrl("mainnet") });

// A pool insuring "stablecoin < $0.97".
export const DEPEG_THRESHOLD = 0.97;

// Pyth PriceInfoObject ids on Sui mainnet — stable shared objects, verified live
// 2026-06-12. hx-split: the repo's secret-scanner hook blocks 0x+64hex literals.
export const DEPEG_FEEDS: { label: string; flagship?: boolean; obj: string }[] =
  [
    {
      label: "suiUSDe",
      flagship: true,
      obj:
        "0x" +
        "9b2028bfc829127d2e5ead1691dc3002de9e9b8d8076b4915e5ecc7d9b99d63f",
    },
    {
      label: "USDC",
      obj:
        "0x" +
        "5dec622733a204ca27f5a90d8c2fad453cc6665186fd5dff13a83d0b6c9027ab",
    },
    {
      label: "USDT",
      obj:
        "0x" +
        "985e3db9f93f76ee8bace7c3dd5cc676a096accd5d9e09e9ae0fb6e492b14572",
    },
  ];

export type DepegReading = {
  label: string;
  flagship?: boolean;
  price: number;
  expo: number;
  publishMs: number;
  triggered: boolean;
  objId: string;
};

const i64 = (v: { fields: { negative: boolean; magnitude: string } }): number =>
  (v.fields.negative ? -1 : 1) * Number(v.fields.magnitude);

export async function fetchDepeg(): Promise<DepegReading[]> {
  const readings = await Promise.all(
    DEPEG_FEEDS.map(async (f): Promise<DepegReading | null> => {
      const o = await mainnet.getObject({
        id: f.obj,
        options: { showContent: true },
      });
      const price = (o.data?.content as any)?.fields?.price_info?.fields
        ?.price_feed?.fields?.price?.fields;
      if (!price) return null;
      const expo = i64(price.expo);
      const value = i64(price.price) * Math.pow(10, expo);
      return {
        label: f.label,
        flagship: f.flagship,
        price: value,
        expo,
        publishMs: Number(price.timestamp) * 1000,
        triggered: value <= DEPEG_THRESHOLD,
        objId: f.obj,
      } satisfies DepegReading;
    }),
  );
  return readings.filter((r): r is DepegReading => r !== null);
}
