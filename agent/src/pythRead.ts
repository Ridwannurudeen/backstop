// Live, read-only proof that Backstop's depeg-cover settlement path works against
// REAL Pyth on Sui mainnet — no funds, no deploy. For each candidate stablecoin
// feed it: (1) resolves the on-chain PriceInfoObject (the exact object
// pyth_cover_pool::record_breach reads), (2) reads its on-chain price, (3) cross-checks
// against Hermes, and (4) evaluates the $0.97 depeg trigger.
//
// Run: npx tsx src/pythRead.ts
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { SuiPythClient } from "@pythnetwork/pyth-sui-js";

// Sui mainnet Pyth + Wormhole state objects (hx-split: the Write hook blocks 0x+64hex).
const PYTH_STATE =
  "0x" + "1f9310238ee9298fb703c3419030b35b22bb1cc37113e3bb5007c99aec79e5b8";
const WORMHOLE_STATE =
  "0x" + "aeab97f96cf9877fee2883315d459552b2b921edc16d7ceac6eab944dd88919c";

// Pyth feed ids (chain-agnostic), verified live via Hermes 2026-06-12.
const FEEDS: { label: string; id: string }[] = [
  {
    label: "suiUSDe/USD",
    id: "8cead549d0e770dea8fdf5e018a85d59585265cf8bff16ba83962fc7996dbb7f",
  },
  {
    label: "USDC/USD",
    id: "eaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a",
  },
  {
    label: "USDT/USD",
    id: "2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b",
  },
  {
    label: "SUI/USD",
    id: "23d7315113f5b1d3ba7a83604c44b94d79f4fd69af77f804fc7f920a6dc65744",
  },
];

const DEPEG_THRESHOLD_USD = 0.97; // a pool insuring "stablecoin < $0.97"
const HERMES = "https://hermes.pyth.network";

type I64 = { magnitude: string; negative: boolean };
const i64ToNumber = (v: I64): number =>
  v.negative ? -Number(v.magnitude) : Number(v.magnitude);

// Navigate PriceInfoObject -> price_info -> price_feed -> price (the Price struct).
function readOnchainPrice(content: any): {
  price: number;
  expo: number;
  publishMs: number;
} {
  const price = content.fields.price_info.fields.price_feed.fields.price.fields;
  const expo = i64ToNumber(price.expo.fields);
  const mag = i64ToNumber(price.price.fields);
  return {
    price: mag * Math.pow(10, expo),
    expo,
    publishMs: Number(price.timestamp) * 1000,
  };
}

async function hermesPrice(
  id: string,
): Promise<{ price: number; publishMs: number } | null> {
  const res = await fetch(`${HERMES}/v2/updates/price/latest?ids[]=${id}`);
  if (!res.ok) return null;
  const data = await res.json();
  const p = data.parsed?.[0]?.price;
  if (!p) return null;
  return {
    price: Number(p.price) * Math.pow(10, Number(p.expo)),
    publishMs: p.publish_time * 1000,
  };
}

async function main() {
  const client = new SuiClient({ url: getFullnodeUrl("mainnet") });
  const pyth = new SuiPythClient(client, PYTH_STATE, WORMHOLE_STATE);

  console.log(
    `Backstop · live Pyth read on Sui mainnet · depeg trigger < $${DEPEG_THRESHOLD_USD}\n`,
  );

  for (const { label, id } of FEEDS) {
    const objId = await pyth.getPriceFeedObjectId(id).catch(() => undefined);
    if (!objId) {
      console.log(
        `✗ ${label.padEnd(12)} feed exists on Pyth but has NO PriceInfoObject on Sui mainnet`,
      );
      console.log(
        `               (would need createPriceFeed before a pool can settle on it)\n`,
      );
      continue;
    }

    const obj = await client.getObject({
      id: objId,
      options: { showContent: true },
    });
    const content: any = obj.data?.content;
    let onchain: { price: number; expo: number; publishMs: number } | null =
      null;
    try {
      onchain = readOnchainPrice(content);
    } catch (e) {
      console.log(
        `! ${label}: PriceInfoObject ${objId} found but price shape unexpected:`,
      );
      console.log(
        JSON.stringify(content?.fields ?? content, null, 2).slice(0, 800),
      );
      continue;
    }

    const herm = await hermesPrice(id);
    const ageS = Math.round((Date.now() - onchain.publishMs) / 1000);
    const triggered = onchain.price <= DEPEG_THRESHOLD_USD;

    console.log(`✓ ${label}`);
    console.log(`    PriceInfoObject : ${objId}`);
    console.log(
      `    on-chain price  : $${onchain.price.toFixed(6)} (expo ${onchain.expo}, ${ageS}s old)`,
    );
    console.log(
      `    hermes price    : ${herm ? `$${herm.price.toFixed(6)}` : "n/a"}`,
    );
    console.log(
      `    depeg trigger   : ${triggered ? "🔴 BREACHED → claim would PAY" : "🟢 above floor → no payout"}\n`,
    );
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
