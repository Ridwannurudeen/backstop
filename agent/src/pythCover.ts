// Off-chain PTB harness for Backstop's Pyth-settled depeg cover (Sui MAINNET).
//
//  - buildBuyCoverTx / buildRecordBreachTx / buildClaimLatchedTx: the transactions a
//    funded wallet runs. Settlement requires a SUSTAINED breach (dwell): a keeper
//    pulls a fresh Pyth update (updatePriceFeeds) and calls pyth_cover_pool::
//    record_breach to ARM the dwell, then again ≥ min_dwell_secs later to CONFIRM it;
//    the holder then claim_latched's the payout (no Pyth read needed). There is no
//    single-read instant claim — a wick cannot pay.
//  - default CLI (`npx tsx src/pythCover.ts`): a NO-FUNDS, read-only devInspect that
//    proves the update + freshness-read at the heart of record_breach works against
//    LIVE mainnet Pyth — same PriceInfoObject + get_price_no_older_than the contract
//    uses.
//  - `--execute`: first run (no POLICY) buys cover. A policy can't record a breach
//    until its activation delay elapses, so rerun with POLICY=.. to ARM the dwell,
//    then again ≥ min_dwell_secs later with CLAIM=1 to CONFIRM + claim. Real funds.
//
// Run (no funds):  npx tsx src/pythCover.ts
// Run (buy):       BACKSTOP_PKG=.. POOL=.. COIN_TYPE=.. SUI_PRIVATE_KEY=.. \
//                  COVER=.. PREMIUM=.. npx tsx src/pythCover.ts --execute
// Run (arm, after activation):
//                  BACKSTOP_PKG=.. POOL=.. SUI_PRIVATE_KEY=.. POLICY=.. \
//                  npx tsx src/pythCover.ts --execute
// Run (confirm+claim, after dwell):  …same + CLAIM=1
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { bcs } from "@mysten/sui/bcs";
import {
  SuiPythClient,
  SuiPriceServiceConnection,
} from "@pythnetwork/pyth-sui-js";

const CLOCK = "0x6";
const HERMES = "https://hermes.pyth.network";
// Sui mainnet Pyth + Wormhole state (hx-split: the Write hook blocks 0x+64hex).
const PYTH_STATE =
  "0x" + "1f9310238ee9298fb703c3419030b35b22bb1cc37113e3bb5007c99aec79e5b8";
const WORMHOLE_STATE =
  "0x" + "aeab97f96cf9877fee2883315d459552b2b921edc16d7ceac6eab944dd88919c";
const SUIUSDE_FEED =
  "8cead549d0e770dea8fdf5e018a85d59585265cf8bff16ba83962fc7996dbb7f";

// Pyth's Price/I64 return layout (field order verified from price.move / i64.move).
const I64 = bcs.struct("I64", { negative: bcs.bool(), magnitude: bcs.u64() });
const Price = bcs.struct("Price", {
  price: I64,
  conf: bcs.u64(),
  expo: I64,
  timestamp: bcs.u64(),
});

const i64Num = (v: { negative: boolean; magnitude: string }): number =>
  (v.negative ? -1 : 1) * Number(v.magnitude);

/** Buy depeg cover using an already-refreshed PriceInfoObject. */
export function buildBuyCoverTx(opts: {
  pkg: string;
  pool: string;
  coinType: string;
  premiumMist: bigint;
  cover: bigint;
  expiryMs: bigint;
  priceInfoObjectId: string;
  recipient: string;
  premiumCoinId?: string;
}): Transaction {
  const tx = new Transaction();
  const source = opts.premiumCoinId ? tx.object(opts.premiumCoinId) : tx.gas;
  const [premium] = tx.splitCoins(source, [tx.pure.u64(opts.premiumMist)]);
  const [policy, refund] = tx.moveCall({
    target: `${opts.pkg}::pyth_cover_pool::buy_cover`,
    typeArguments: [opts.coinType],
    arguments: [
      tx.object(opts.pool),
      premium,
      tx.pure.u64(opts.cover),
      tx.pure.u64(opts.expiryMs),
      tx.object(opts.priceInfoObjectId),
      tx.object(CLOCK),
    ],
  });
  tx.transferObjects([policy, refund], opts.recipient);
  return tx;
}

/** Buy v4 depeg cover with a same-PTB Pyth sale check. */
export async function buildBuyCoverWithPythTx(opts: {
  client: SuiClient;
  pkg: string;
  pool: string;
  coinType: string;
  premiumMist: bigint;
  cover: bigint;
  expiryMs: bigint;
  recipient: string;
  feedId: string;
  premiumCoinId?: string;
}): Promise<Transaction> {
  const tx = new Transaction();
  const updates = await new SuiPriceServiceConnection(
    HERMES,
  ).getPriceFeedsUpdateData([opts.feedId]);
  const pyth = new SuiPythClient(opts.client, PYTH_STATE, WORMHOLE_STATE);
  const [priceInfoObjectId] = await pyth.updatePriceFeeds(tx, updates, [
    opts.feedId,
  ]);
  const source = opts.premiumCoinId ? tx.object(opts.premiumCoinId) : tx.gas;
  const [premium] = tx.splitCoins(source, [tx.pure.u64(opts.premiumMist)]);
  const [policy, refund] = tx.moveCall({
    target: `${opts.pkg}::pyth_cover_pool::buy_cover`,
    typeArguments: [opts.coinType],
    arguments: [
      tx.object(opts.pool),
      premium,
      tx.pure.u64(opts.cover),
      tx.pure.u64(opts.expiryMs),
      tx.object(priceInfoObjectId),
      tx.object(CLOCK),
    ],
  });
  tx.transferObjects([policy, refund], opts.recipient);
  return tx;
}

/**
 * Record a sub-threshold observation trustlessly: refresh the Pyth feed, then call
 * record_breach in one PTB. Run once to ARM the dwell and again ≥ min_dwell_secs
 * later to CONFIRM it; the confirming call latches the policy for claim_latched.
 */
export async function buildRecordBreachTx(opts: {
  client: SuiClient;
  pkg: string;
  pool: string;
  coinType: string;
  policy: string;
  feedId: string;
}): Promise<Transaction> {
  const tx = new Transaction();
  const updates = await new SuiPriceServiceConnection(
    HERMES,
  ).getPriceFeedsUpdateData([opts.feedId]);
  const pyth = new SuiPythClient(opts.client, PYTH_STATE, WORMHOLE_STATE);
  const [priceInfoObjectId] = await pyth.updatePriceFeeds(tx, updates, [
    opts.feedId,
  ]);
  tx.moveCall({
    target: `${opts.pkg}::pyth_cover_pool::record_breach`,
    typeArguments: [opts.coinType],
    arguments: [
      tx.object(opts.pool),
      tx.object(opts.policy),
      tx.object(priceInfoObjectId),
      tx.object(CLOCK),
    ],
  });
  return tx;
}

/** Claim a latched policy (no Pyth read needed — the breach was already recorded). */
export function buildClaimLatchedTx(opts: {
  pkg: string;
  pool: string;
  coinType: string;
  policy: string;
  recipient: string;
}): Transaction {
  const tx = new Transaction();
  const payout = tx.moveCall({
    target: `${opts.pkg}::pyth_cover_pool::claim_latched`,
    typeArguments: [opts.coinType],
    arguments: [tx.object(opts.pool), tx.object(opts.policy)],
  });
  tx.transferObjects([payout], opts.recipient);
  return tx;
}

/** No-funds live proof: update the feed and read it with get_price_no_older_than. */
async function simulate(
  client: SuiClient,
  feedId: string,
  maxAgeSecs = 60,
): Promise<void> {
  const tx = new Transaction();
  const updates = await new SuiPriceServiceConnection(
    HERMES,
  ).getPriceFeedsUpdateData([feedId]);
  const pyth = new SuiPythClient(client, PYTH_STATE, WORMHOLE_STATE);
  const [priceInfoObjectId] = await pyth.updatePriceFeeds(tx, updates, [
    feedId,
  ]);
  const pythPkg = await pyth.getPackageId(PYTH_STATE);
  tx.moveCall({
    target: `${pythPkg}::pyth::get_price_no_older_than`,
    arguments: [
      tx.object(priceInfoObjectId),
      tx.object(CLOCK),
      tx.pure.u64(maxAgeSecs),
    ],
  });

  const sender = "0x" + "0".repeat(64);
  const res = await client.devInspectTransactionBlock({
    sender,
    transactionBlock: tx,
  });
  if (res.effects?.status?.status !== "success") {
    throw new Error(
      `devInspect failed: ${res.effects?.status?.error ?? JSON.stringify(res.error)}`,
    );
  }
  const rv = (res.results ?? []).flatMap((r) => r.returnValues ?? []).pop();
  if (!rv) throw new Error("no return value from get_price_no_older_than");
  const p = Price.parse(Uint8Array.from(rv[0]));
  const human = i64Num(p.price) * Math.pow(10, i64Num(p.expo));

  console.log(
    "Backstop · live devInspect of the dwell read at the heart of record_breach (Sui mainnet, no funds)\n",
  );
  console.log(`  feed                : ${feedId.slice(0, 10)}…`);
  console.log(`  PriceInfoObject     : ${priceInfoObjectId}`);
  console.log(
    `  get_price_no_older_than(maxAge=${maxAgeSecs}s) => $${human.toFixed(6)} (expo ${i64Num(p.expo)})`,
  );
  console.log(
    `  publish ts          : ${new Date(Number(p.timestamp) * 1000).toISOString()}`,
  );
  console.log(
    `\n  ✓ fresh Pyth update + freshness-bounded read execute on mainnet —`,
  );
  console.log(
    `    this is the exact path pyth_cover_pool::record_breach runs to arm/confirm the dwell.`,
  );
}

async function execute(client: SuiClient): Promise<void> {
  const env = (n: string): string => {
    const v = process.env[n];
    if (!v) throw new Error(`Set ${n}`);
    return v;
  };
  const pkg = env("BACKSTOP_PKG");
  const pool = env("POOL");
  const coinType = process.env.COIN_TYPE ?? "0x2::sui::SUI";
  const kp = Ed25519Keypair.fromSecretKey(env("SUI_PRIVATE_KEY").trim());
  const addr = kp.getPublicKey().toSuiAddress();

  const send = async (tx: Transaction, label: string) => {
    const out = await client.signAndExecuteTransaction({
      signer: kp,
      transaction: tx,
      options: { showEffects: true, showEvents: true, showObjectChanges: true },
    });
    const status = out.effects?.status?.status;
    console.log(`${label}: ${status} · ${out.digest}`);
    if (status !== "success")
      throw new Error(out.effects?.status?.error ?? `${label} failed`);
    await client.waitForTransaction({ digest: out.digest });
    return out;
  };

  // Phase 2 — advance the dwell (POLICY already bought). record_breach arms on the
  // first run after activation and confirms on a run ≥ min_dwell_secs later. Set
  // CLAIM=1 once the dwell is satisfied to also claim_latched in the same run.
  if (process.env.POLICY) {
    const policy = process.env.POLICY;
    const recTx = await buildRecordBreachTx({
      client,
      pkg,
      pool,
      coinType,
      policy,
      feedId: SUIUSDE_FEED,
    });
    await send(
      recTx,
      "record_breach (arm or confirm — only if depegged + active)",
    );
    if (process.env.CLAIM) {
      const claimTx = buildClaimLatchedTx({
        pkg,
        pool,
        coinType,
        policy,
        recipient: addr,
      });
      await send(claimTx, "claim_latched (pays the latched payout)");
    } else {
      console.log(
        "\n  Set CLAIM=1 on a run ≥ min_dwell_secs after arming to confirm + claim.",
      );
    }
    return;
  }

  // Phase 1 — buy cover. The policy can't record a breach until its activation
  // delay elapses, so arming happens on a later run (phase 2), not here.
  const buyTx = await buildBuyCoverWithPythTx({
    client,
    pkg,
    pool,
    coinType,
    premiumMist: BigInt(env("PREMIUM")),
    cover: BigInt(env("COVER")),
    expiryMs: BigInt(Date.now() + 86_400_000),
    recipient: addr,
    feedId: SUIUSDE_FEED,
  });
  const bought = await send(buyTx, "buy_cover");
  const policy = (
    (bought.objectChanges ?? []).find(
      (o: any) =>
        o.type === "created" && /::pyth_cover_pool::Policy/.test(o.objectType),
    ) as any
  )?.objectId;
  console.log(`  POLICY=${policy}`);
  console.log(
    `\n  ✓ bought. After activation_delay, rerun with POLICY=${policy} to arm the` +
      ` dwell;\n    rerun again after min_dwell_secs to confirm + claim.`,
  );
}

async function main(): Promise<void> {
  const client = new SuiClient({ url: getFullnodeUrl("mainnet") });
  if (process.argv.includes("--execute")) await execute(client);
  else await simulate(client, SUIUSDE_FEED);
}

main().catch((e) => {
  console.error("FAILED:", (e as Error).message ?? e);
  process.exit(1);
});
