import type { SuiClient } from "@mysten/sui/client";
import { SUIUSD_PRICE_OBJECT } from "./deployment";

export type PythUsdPrice = {
  price: number;
  conf: number;
  confBps: number;
  publishMs: number;
  objectId: string;
};

type Fields = Record<string, unknown>;

const isRecord = (v: unknown): v is Fields =>
  typeof v === "object" && v !== null;

const fieldsOf = (value: unknown): Fields | null => {
  if (!isRecord(value) || !isRecord(value.fields)) return null;
  return value.fields;
};

const numeric = (value: unknown, field: string): number => {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;
  if (Number.isFinite(parsed)) return parsed;
  throw new Error(`unexpected Pyth ${field} field`);
};

const i64 = (value: unknown, field: string): number => {
  const fields = fieldsOf(value);
  if (!fields || typeof fields.negative !== "boolean") {
    throw new Error(`unexpected Pyth ${field} field`);
  }
  const magnitude = numeric(fields.magnitude, field);
  return (fields.negative ? -1 : 1) * magnitude;
};

export async function readPythUsdPrice(
  client: SuiClient,
  objectId: string,
): Promise<PythUsdPrice> {
  const object = await client.getObject({
    id: objectId,
    options: { showContent: true },
  });
  const root = fieldsOf(object.data?.content);
  const priceInfo = fieldsOf(root?.price_info);
  const priceFeed = fieldsOf(priceInfo?.price_feed);
  const price = fieldsOf(priceFeed?.price);
  if (!price) throw new Error("Pyth PriceInfoObject shape changed");

  const value =
    i64(price.price, "price") * Math.pow(10, i64(price.expo, "expo"));
  const conf =
    numeric(price.conf, "conf") * Math.pow(10, i64(price.expo, "expo"));
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("Pyth price is not positive");
  }

  return {
    price: value,
    conf,
    confBps: (conf / value) * 10_000,
    publishMs: numeric(price.timestamp, "timestamp") * 1000,
    objectId,
  };
}

export const readSuiUsdPrice = (client: SuiClient) =>
  readPythUsdPrice(client, SUIUSD_PRICE_OBJECT);
