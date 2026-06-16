import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import {
  fetchNaviExposure,
  fetchSuilendExposure,
  parseSuilendObligationObjects,
} from "../../app/src/lib/depegPosition";
import { readSuiUsdPrice } from "../../app/src/lib/pythPrice";

const hx = (a: string, b: string) => "0x" + a + b;

const PUBLIC_SUILEND_USDE_OBLIGATION = hx(
  "184a6b58954b574d0a6c5a6715bbbdb7",
  "849c2078919b5c75e58c5c68dab3e43a",
);
const EMPTY_OWNER = normalizeSuiAddress("0x2");

const ok = (message: string) => console.log(`ok ${message}`);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function verifyPyth(client: SuiClient) {
  const price = await readSuiUsdPrice(client);
  assert(price.price > 0, "SUI/USD price must be positive");
  assert(Number.isFinite(price.confBps), "SUI/USD confidence must be finite");
  ok(
    `Pyth SUI/USD ${price.price.toFixed(4)} (${price.confBps.toFixed(2)} bps conf)`,
  );
}

async function verifySuilendParser(client: SuiClient) {
  const object = await client.getObject({
    id: PUBLIC_SUILEND_USDE_OBLIGATION,
    options: { showContent: true, showType: true },
  });
  assert(object.data, "public Suilend obligation not found");

  const lines = parseSuilendObligationObjects([object.data]);
  const usde = lines.find((line) =>
    `${line.symbol} ${line.coinType}`.toLowerCase().includes("usde"),
  );
  assert(usde, "public Suilend obligation no longer has a USDe-family line");
  assert(
    usde.valueUsd > 0,
    "Suilend USDe-family line must have positive USD value",
  );
  ok(
    `Suilend parser found ${usde.symbol} ${usde.side} worth $${usde.valueUsd.toFixed(4)}`,
  );
}

async function verifyEmptyOwnerReads(client: SuiClient) {
  const suilend = await fetchSuilendExposure(client, EMPTY_OWNER);
  assert(
    suilend.ownerCapCount === 0,
    "empty owner should not have Suilend caps",
  );
  assert(
    suilend.lines.length === 0,
    "empty owner should not have Suilend lines",
  );
  ok("Suilend empty-owner read returns an empty summary");

  const navi = await fetchNaviExposure(client, EMPTY_OWNER);
  assert(navi.lines.length === 0, "empty owner should not have NAVI lines");
  ok("NAVI dynamic import and empty-owner read return an empty summary");
}

async function main() {
  const client = new SuiClient({ url: getFullnodeUrl("mainnet") });
  await verifyPyth(client);
  await verifySuilendParser(client);
  await verifyEmptyOwnerReads(client);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
