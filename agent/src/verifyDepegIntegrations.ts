import { SuiClient } from "@mysten/sui/client";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import type { SuiObjectData } from "@mysten/sui/client";
import {
  fetchNaviExposure,
  fetchSuilendExposure,
  type LendingPosition,
  parseSuilendObligationObjects,
  SUILEND_OBLIGATION_TYPE,
  summarizeNaviPositions,
} from "../../app/src/lib/depegPosition";
import { readSuiUsdPrice } from "../../app/src/lib/pythPrice";
import { retryTransient } from "./retry.js";
import { suiRpcUrl } from "./rpc.js";

const hx = (a: string, b: string) => "0x" + a + b;

const PUBLIC_SUILEND_USDE_OBLIGATION = hx(
  "184a6b58954b574d0a6c5a6715bbbdb7",
  "849c2078919b5c75e58c5c68dab3e43a",
);
const EMPTY_OWNER = normalizeSuiAddress("0x2");
const USDE_COIN_TYPE =
  "0x" +
  "a99b8952d4f7dff6fa8cc05a7a995e142095b5e0e1d2e4a3b2b1e0c9d8f7a6b5" +
  "::usde::USDE";

const ok = (message: string) => console.log(`ok ${message}`);
const skip = (message: string) => console.log(`skip ${message}`);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function verifyPyth(client: SuiClient) {
  const price = await retryTransient("read Pyth SUI/USD", () =>
    readSuiUsdPrice(client),
  );
  assert(price.price > 0, "SUI/USD price must be positive");
  assert(Number.isFinite(price.confBps), "SUI/USD confidence must be finite");
  ok(
    `Pyth SUI/USD ${price.price.toFixed(4)} (${price.confBps.toFixed(2)} bps conf)`,
  );
}

async function verifySuilendParser(client: SuiClient) {
  const object = await retryTransient("read public Suilend obligation", () =>
    client.getObject({
      id: PUBLIC_SUILEND_USDE_OBLIGATION,
      options: { showContent: true, showType: true },
    }),
  );
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

function verifySuilendFixtureParser() {
  const object = {
    objectId: PUBLIC_SUILEND_USDE_OBLIGATION,
    version: "1",
    digest: "fixture",
    type: SUILEND_OBLIGATION_TYPE,
    content: {
      dataType: "moveObject",
      type: SUILEND_OBLIGATION_TYPE,
      hasPublicTransfer: false,
      fields: {
        deposits: [
          {
            fields: {
              coin_type: { fields: { name: USDE_COIN_TYPE } },
              market_value: { fields: { value: "125500000000000000000" } },
            },
          },
        ],
        borrows: [
          {
            fields: {
              coin_type: { fields: { name: USDE_COIN_TYPE } },
              market_value: { fields: { value: "20250000000000000000" } },
            },
          },
        ],
      },
    },
  } as SuiObjectData;

  const lines = parseSuilendObligationObjects([object]);
  const supply = lines.find((line) => line.side === "supply");
  const borrow = lines.find((line) => line.side === "borrow");
  assert(supply?.valueUsd === 125.5, "Suilend fixture supply mismatch");
  assert(borrow?.valueUsd === 20.25, "Suilend fixture borrow mismatch");
  ok("Suilend fixture parser summarizes USDe supply and borrow");
}

function verifyNaviFixtureParser() {
  const supplyPool = {} as NonNullable<
    LendingPosition["navi-lending-supply"]
  >["pool"];
  const borrowPool = {} as NonNullable<
    LendingPosition["navi-lending-borrow"]
  >["pool"];
  const token = {
    coinType: USDE_COIN_TYPE,
    decimals: 6,
    logoUri: "",
    symbol: "suiUSDe",
    price: 1,
  };
  const positions: LendingPosition[] = [
    {
      id: "navi-supply-fixture",
      wallet: EMPTY_OWNER,
      protocol: "navi",
      market: "main",
      type: "navi-lending-supply",
      "navi-lending-supply": {
        amount: "125.5",
        valueUSD: "125.50",
        token,
        pool: supplyPool,
      },
    },
    {
      id: "navi-borrow-fixture",
      wallet: EMPTY_OWNER,
      protocol: "navi",
      market: "main",
      type: "navi-lending-borrow",
      "navi-lending-borrow": {
        amount: "20.25",
        valueUSD: "20.25",
        token,
        pool: borrowPool,
      },
    },
  ];

  const summary = summarizeNaviPositions(positions);
  assert(summary.lines.length === 2, "NAVI fixture line count mismatch");
  assert(summary.usdeSupplyUsd === 125.5, "NAVI fixture supply mismatch");
  assert(summary.usdeBorrowUsd === 20.25, "NAVI fixture borrow mismatch");
  ok("NAVI fixture parser summarizes USDe supply and borrow");
}

async function verifyEmptyOwnerReads(client: SuiClient) {
  const suilend = await retryTransient(
    "read empty-owner Suilend exposure",
    () => fetchSuilendExposure(client, EMPTY_OWNER),
  );
  assert(
    suilend.ownerCapCount === 0,
    "empty owner should not have Suilend caps",
  );
  assert(
    suilend.lines.length === 0,
    "empty owner should not have Suilend lines",
  );
  ok("Suilend empty-owner read returns an empty summary");

  try {
    const navi = await fetchNaviExposure(client, EMPTY_OWNER);
    assert(navi.lines.length === 0, "empty owner should not have NAVI lines");
    ok("NAVI dynamic import and empty-owner read return an empty summary");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/fetch failed|ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(message)) {
      skip(`NAVI live empty-owner read unavailable: ${message}`);
      return;
    }
    throw error;
  }
}

async function main() {
  const client = new SuiClient({ url: suiRpcUrl("mainnet") });
  verifySuilendFixtureParser();
  verifyNaviFixtureParser();
  await verifyPyth(client);
  await verifySuilendParser(client);
  await verifyEmptyOwnerReads(client);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
