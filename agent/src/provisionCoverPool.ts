// Provision a clean PUBLIC cover pool for the app's "Cover pool" tab:
//   1. publish a calm reading on a fresh market (we hold the PublisherCap)
//   2. create_and_share a CoverPool<SUI> for it
//   3. seed a little LP capital so cover is buyable out of the box
// Prints the new pool object id to wire into the app (deployment.ts/json).
//
// Env: SUI_PRIVATE_KEY (funded), COVER_POOL_PKG, RISK_FEED_PKG, RISK_FEED_OBJ,
//      PUBLISHER_CAP. Optional: POOL_MARKET (default "BTC-CRASH-30D").
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { NETWORK, CLOCK } from "./ids.js";

const SUI = "0x2::sui::SUI";

const CALM_BPS = 800n; // 8% implied crash prob — calm
const TRIGGER_BPS = 3000n; // claim pays at >= 30%
const LOADING_BPS = 11_000n; // 1.1x fair premium
const SEED_MIST = 100_000_000n; // 0.1 SUI of LP capital
const REF_PRICE = 60_000_000000000n; // 1e9-scaled reference price, for context

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Set ${name}`);
  return v;
}

async function main(): Promise<void> {
  const POOL_PKG = env("COVER_POOL_PKG");
  const FEED_PKG = env("RISK_FEED_PKG");
  const FEED = env("RISK_FEED_OBJ");
  const CAP = env("PUBLISHER_CAP");
  const market = process.env.POOL_MARKET ?? "BTC-CRASH-30D";

  const client = new SuiClient({ url: getFullnodeUrl(NETWORK) });
  const kp = Ed25519Keypair.fromSecretKey(env("SUI_PRIVATE_KEY").trim());
  const addr = kp.getPublicKey().toSuiAddress();

  const run = async (tx: Transaction, label: string) => {
    const out = await client.signAndExecuteTransaction({
      signer: kp,
      transaction: tx,
      options: { showObjectChanges: true, showEffects: true },
    });
    const status = out.effects?.status?.status;
    console.log(`${label}: ${status} · ${out.digest}`);
    if (status !== "success") {
      console.log("  abort:", out.effects?.status?.error);
      throw new Error(`${label} failed`);
    }
    await client.waitForTransaction({ digest: out.digest });
    return out;
  };

  // 1) calm reading establishes the market
  const pubTx = new Transaction();
  pubTx.moveCall({
    target: `${FEED_PKG}::risk_feed::publish`,
    arguments: [
      pubTx.object(FEED),
      pubTx.object(CAP),
      pubTx.pure.string(market),
      pubTx.pure.u64(CALM_BPS),
      pubTx.pure.u64(REF_PRICE),
      pubTx.pure.string("public-cover-pool"),
      pubTx.object(CLOCK),
    ],
  });
  await run(pubTx, `1. publish calm reading (${CALM_BPS}bps) on ${market}`);

  // 2) create + share the pool
  const createTx = new Transaction();
  createTx.moveCall({
    target: `${POOL_PKG}::cover_pool::create_and_share`,
    typeArguments: [SUI],
    arguments: [
      createTx.pure.vector("u8", Array.from(new TextEncoder().encode(market))),
      createTx.pure.u64(TRIGGER_BPS),
      createTx.pure.u64(LOADING_BPS),
    ],
  });
  const c2 = await run(createTx, "2. create_and_share pool");
  const pool = (c2.objectChanges ?? []).find(
    (o: any) => o.type === "created" && /CoverPool/.test(o.objectType),
  ) as any;
  if (!pool) throw new Error("pool object not found in changes");

  // 3) seed LP capital
  const seedTx = new Transaction();
  const [coin] = seedTx.splitCoins(seedTx.gas, [seedTx.pure.u64(SEED_MIST)]);
  const lpShare = seedTx.moveCall({
    target: `${POOL_PKG}::cover_pool::deposit_lp`,
    typeArguments: [SUI],
    arguments: [seedTx.object(pool.objectId), coin],
  });
  seedTx.transferObjects([lpShare], addr);
  await run(seedTx, `3. seed LP ${SEED_MIST} mist`);

  console.log(`\nPUBLIC_POOL=${pool.objectId}`);
  console.log(`MARKET=${market}`);
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
