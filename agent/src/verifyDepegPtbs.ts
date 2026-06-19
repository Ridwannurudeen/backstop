import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import {
  SuiPriceServiceConnection,
  SuiPythClient,
} from "@pythnetwork/pyth-sui-js";
import {
  buildDepegBuyCoverWithPythTx,
  buildDepegDepositLpTx,
  buildDepegWithdrawLpTx,
  quoteDepegPremium,
  readDepegPool,
} from "../../app/src/lib/depegPool";
import {
  CLOCK,
  HERMES,
  PYTH_STATE,
  SUI_TYPE,
  SUIUSDE_FEED_ID,
  WORMHOLE_STATE,
} from "../../app/src/lib/deployment";
import { retryTransient } from "./retry.js";
import { suiRpcUrl } from "./rpc.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const ZERO_SENDER = "0x" + "0".repeat(64);
const RECORD_NOT_ACTIVE = 14;
const CLAIM_NOT_BREACHED = 11;
const WITHDRAW_INSOLVENT = 2;
const DIRECT_SALES_DISABLED = 32;
const EXPIRY_SAFETY_MS = 60_000;
type MoveCallResult = ReturnType<Transaction["moveCall"]>;

type Deployment = {
  pythDepeg?: {
    coverPackage?: string;
    productionPool?: {
      pool?: string;
      depositLpDigest?: string;
    };
  };
};

type InspectExpectation =
  | { kind: "success" }
  | { kind: "abort"; code: number }
  | { kind: "success-or-abort"; code: number };

const ok = (message: string) => console.log(`ok ${message}`);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function readDeployment(): Deployment {
  return JSON.parse(
    readFileSync(join(ROOT, "deployment.json"), "utf8"),
  ) as Deployment;
}

const abortCodePattern = (code: number) => new RegExp(`\\}, ${code}\\)`);

async function inspect(
  client: SuiClient,
  label: string,
  transactionBlock: Transaction,
  expectation: InspectExpectation,
): Promise<void> {
  const result = await retryTransient(`devInspect ${label}`, () =>
    client.devInspectTransactionBlock({
      sender: ZERO_SENDER,
      transactionBlock,
    }),
  );
  const status = result.effects?.status?.status;
  const error = result.effects?.status?.error ?? result.error ?? "";

  if (expectation.kind === "success") {
    assert(status === "success", `${label} failed: ${error || status}`);
    ok(`${label} devInspect success`);
    return;
  }

  if (expectation.kind === "success-or-abort" && status === "success") {
    ok(`${label} devInspect success`);
    return;
  }

  assert(status === "failure", `${label} expected abort, got ${status}`);
  assert(
    abortCodePattern(expectation.code).test(error),
    `${label} expected abort ${expectation.code}, got ${error}`,
  );
  ok(`${label} reached expected abort ${expectation.code}`);
}

async function createdObjectFromTx(
  client: SuiClient,
  digest: string,
  typeFragment: string,
): Promise<string> {
  const tx = await retryTransient(`read tx ${digest}`, () =>
    client.getTransactionBlock({
      digest,
      options: { showObjectChanges: true },
    }),
  );
  const created = (tx.objectChanges ?? []).find(
    (change) =>
      change.type === "created" &&
      "objectType" in change &&
      typeof change.objectType === "string" &&
      change.objectType.includes(typeFragment),
  );
  assert(
    created && "objectId" in created,
    `${typeFragment} object not found in ${digest}`,
  );
  return created.objectId;
}

async function buyPolicyProbe(
  client: SuiClient,
  opts: {
    pkg: string;
    pool: string;
    premiumMist: bigint;
    coverMist: bigint;
    expiryMs: bigint;
  },
): Promise<{
  tx: Transaction;
  policy: MoveCallResult[0];
  priceInfoObjectId: string;
}> {
  const tx = new Transaction();
  const updates = await new SuiPriceServiceConnection(
    HERMES,
  ).getPriceFeedsUpdateData([SUIUSDE_FEED_ID]);
  const pyth = new SuiPythClient(client, PYTH_STATE, WORMHOLE_STATE);
  const [priceInfoObjectId] = await pyth.updatePriceFeeds(tx, updates, [
    SUIUSDE_FEED_ID,
  ]);
  const [premium] = tx.splitCoins(tx.gas, [tx.pure.u64(opts.premiumMist)]);
  const [policy, refund] = tx.moveCall({
    target: `${opts.pkg}::pyth_cover_pool::buy_cover`,
    typeArguments: [SUI_TYPE],
    arguments: [
      tx.object(opts.pool),
      premium,
      tx.pure.u64(opts.coverMist),
      tx.pure.u64(opts.expiryMs),
      tx.object(priceInfoObjectId),
      tx.object(CLOCK),
    ],
  });
  tx.transferObjects([refund], ZERO_SENDER);
  return { tx, policy, priceInfoObjectId };
}

async function buildBuyThenRecordProbe(
  client: SuiClient,
  opts: {
    pkg: string;
    pool: string;
    premiumMist: bigint;
    coverMist: bigint;
    expiryMs: bigint;
  },
): Promise<Transaction> {
  const { tx, policy, priceInfoObjectId } = await buyPolicyProbe(client, opts);
  tx.moveCall({
    target: `${opts.pkg}::pyth_cover_pool::record_breach`,
    typeArguments: [SUI_TYPE],
    arguments: [
      tx.object(opts.pool),
      policy,
      tx.object(priceInfoObjectId),
      tx.object(CLOCK),
    ],
  });
  tx.transferObjects([policy], ZERO_SENDER);
  return tx;
}

async function buildBuyThenClaimProbe(
  client: SuiClient,
  opts: {
    pkg: string;
    pool: string;
    premiumMist: bigint;
    coverMist: bigint;
    expiryMs: bigint;
  },
): Promise<Transaction> {
  const { tx, policy } = await buyPolicyProbe(client, opts);
  const payout = tx.moveCall({
    target: `${opts.pkg}::pyth_cover_pool::claim_latched`,
    typeArguments: [SUI_TYPE],
    arguments: [tx.object(opts.pool), policy],
  });
  tx.transferObjects([payout], ZERO_SENDER);
  return tx;
}

async function main(): Promise<void> {
  const deployment = readDeployment();
  const pyth = deployment.pythDepeg;
  assert(pyth?.coverPackage, "deployment.json missing pythDepeg.coverPackage");
  assert(
    pyth.productionPool?.pool,
    "deployment.json missing production pool id",
  );
  assert(
    pyth.productionPool.depositLpDigest,
    "deployment.json missing production LP deposit digest",
  );
  const coverPackage = pyth.coverPackage;
  const productionPool = pyth.productionPool.pool;
  const productionDepositDigest = pyth.productionPool.depositLpDigest;

  const client = new SuiClient({ url: suiRpcUrl("mainnet") });
  const pool = await retryTransient("read production depeg pool", () =>
    readDepegPool(client, productionPool),
  );
  const coverMist = 1_000_000n;
  const premiumMist = quoteDepegPremium(pool, coverMist);
  const directSalesEnabled = pool.directSalesEnabled;

  await inspect(
    client,
    "production deposit_lp builder",
    buildDepegDepositLpTx({
      pkg: coverPackage,
      poolId: productionPool,
      amountMist: coverMist,
      owner: ZERO_SENDER,
    }),
    { kind: "success" },
  );
  await inspect(
    client,
    "production buy_cover builder",
    await retryTransient("build production buy_cover probe", () =>
      buildDepegBuyCoverWithPythTx({
        client,
        pkg: coverPackage,
        poolId: productionPool,
        premiumMist,
        coverMist,
        expiryMs: BigInt(Date.now() + 30 * 86_400_000 - EXPIRY_SAFETY_MS),
        owner: ZERO_SENDER,
      }),
    ),
    directSalesEnabled
      ? { kind: "success" }
      : { kind: "abort", code: DIRECT_SALES_DISABLED },
  );

  const shareId = await createdObjectFromTx(
    client,
    productionDepositDigest,
    "::pyth_cover_pool::LpShare",
  );
  await inspect(
    client,
    "production withdraw_lp builder",
    buildDepegWithdrawLpTx({
      pkg: coverPackage,
      poolId: productionPool,
      shareId,
      owner: ZERO_SENDER,
    }),
    { kind: "success-or-abort", code: WITHDRAW_INSOLVENT },
  );

  if (directSalesEnabled) {
    await inspect(
      client,
      "production buy -> record_breach PTB",
      await retryTransient("build production record_breach probe", () =>
        buildBuyThenRecordProbe(client, {
          pkg: coverPackage,
          pool: productionPool,
          premiumMist,
          coverMist,
          expiryMs: BigInt(Date.now() + 30 * 86_400_000 - EXPIRY_SAFETY_MS),
        }),
      ),
      { kind: "abort", code: RECORD_NOT_ACTIVE },
    );
    await inspect(
      client,
      "production buy -> claim_latched PTB",
      await retryTransient("build production claim_latched probe", () =>
        buildBuyThenClaimProbe(client, {
          pkg: coverPackage,
          pool: productionPool,
          premiumMist,
          coverMist,
          expiryMs: BigInt(Date.now() + 30 * 86_400_000 - EXPIRY_SAFETY_MS),
        }),
      ),
      { kind: "abort", code: CLAIM_NOT_BREACHED },
    );
  } else {
    ok(
      "production pool rejects direct buys; adapter BuyerCap path is required",
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
