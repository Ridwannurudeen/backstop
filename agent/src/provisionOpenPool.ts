// Create an OPEN, direct-sale DepegCoverPool<SUI> on Sui MAINNET so any wallet can
// buy cover from the app (the production pool is adapter-only by design). Requires a
// cover package that exposes `set_direct_sales` (the open-sales build). The pool uses a
// real below-spot suiUSDe floor and small exposure caps, so direct buys are live while
// real-money risk stays bounded.
//
//   1. create_and_share<SUI> -> a DepegCoverPool<SUI> (+ AdminCap, BuyerCap to creator)
//   2. set_direct_sales(true) -> open the direct wallet purchase path
//   3. deposit_lp             -> seed collateral so cover can be bought
//
// Run:  BACKSTOP_PKG=0x.. SUI_PRIVATE_KEY=.. npx tsx src/provisionOpenPool.ts
//   env: BACKSTOP_PKG (open-sales cover package), SUI_PRIVATE_KEY or SUI_KEY_ALIAS
//   opt: LP_SEED (mist, default 0.1 SUI), MAX_COVER_PER_POLICY (mist, default 0.02 SUI),
//        MAX_TOTAL_COVER (mist, default 0.1 SUI), THRESHOLD_USD (default 0.985),
//        ACTIVATION_DELAY_SECS (default 300, min 300), MIN_DWELL_SECS (default 300, min 300),
//        PREMIUM_BPS (default 200), SURGE_PREMIUM_BPS (default 800),
//        TIMELOCK_SECS (default 3600, min 3600), TREASURY_FEE_BPS (default 500),
//        KEEPER_BOUNTY (mist, default 100000), MAX_POLICY_DURATION_SECS (default 2592000)
import {
  SuiClient,
  type SuiObjectChange,
  type SuiTransactionBlockResponse,
} from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { suiRpcUrl } from "./rpc.js";
import { loadSuiKeypair } from "./suiSigner.js";

const SUI = "0x2::sui::SUI";
const SUIUSDE_FEED =
  "8cead549d0e770dea8fdf5e018a85d59585265cf8bff16ba83962fc7996dbb7f";
const hexBytes = (h: string) => Array.from(Buffer.from(h, "hex"));
const envU64 = (name: string, fallback: string) =>
  BigInt(process.env[name] ?? fallback);

async function main(): Promise<void> {
  const pkg = process.env.BACKSTOP_PKG?.trim();
  if (!pkg) throw new Error("Set BACKSTOP_PKG to the open-sales cover package");
  const client = new SuiClient({ url: suiRpcUrl("mainnet") });
  const kp = loadSuiKeypair();
  const addr = kp.getPublicKey().toSuiAddress();

  const run = async (
    tx: Transaction,
    label: string,
  ): Promise<SuiTransactionBlockResponse> => {
    const out = await client.signAndExecuteTransaction({
      signer: kp,
      transaction: tx,
      options: { showObjectChanges: true, showEffects: true },
    });
    const st = out.effects?.status?.status;
    console.log(`${label}: ${st} · ${out.digest}`);
    if (st !== "success") {
      console.log("  abort:", out.effects?.status?.error);
      throw new Error(`${label} failed`);
    }
    await client.waitForTransaction({ digest: out.digest });
    return out;
  };
  const created = (out: SuiTransactionBlockResponse, re: RegExp): string => {
    const c = (out.objectChanges ?? []).find(
      (
        o: SuiObjectChange,
      ): o is Extract<SuiObjectChange, { type: "created" }> =>
        o.type === "created" && re.test(o.objectType),
    );
    if (!c) throw new Error(`no created object matching ${re}`);
    return c.objectId as string;
  };

  const expoMag = 8; // suiUSDe/USD is expo -8 (verified live on mainnet)
  const thresholdUsd = Number(process.env.THRESHOLD_USD ?? "0.985");
  const thresholdUnits = BigInt(Math.round(thresholdUsd * 10 ** expoMag));

  // 1. create + share the pool.
  const createTx = new Transaction();
  createTx.moveCall({
    target: `${pkg}::pyth_cover_pool::create_and_share`,
    typeArguments: [SUI],
    arguments: [
      createTx.pure.vector("u8", hexBytes(SUIUSDE_FEED)),
      createTx.pure.bool(true),
      createTx.pure.u64(expoMag),
      createTx.pure.u64(thresholdUnits),
      createTx.pure.u64(envU64("MAX_AGE_SECS", "60")),
      createTx.pure.u64(envU64("PREMIUM_BPS", "200")),
      createTx.pure.u64(envU64("SURGE_PREMIUM_BPS", "800")),
      createTx.pure.u64(envU64("MAX_CONF_BPS", "200")),
      createTx.pure.u64(envU64("MIN_DWELL_SECS", "300")), // >= 300 (production floor)
      createTx.pure.u64(envU64("ACTIVATION_DELAY_SECS", "300")), // >= 300 (production floor)
      createTx.pure.u64(envU64("MAX_POLICY_DURATION_SECS", "2592000")),
      createTx.pure.u64(envU64("MAX_COVER_PER_POLICY", "20000000")), // 0.02 SUI
      createTx.pure.u64(envU64("MAX_TOTAL_COVER", "100000000")), // 0.1 SUI
      createTx.pure.u64(envU64("TIMELOCK_SECS", "3600")), // >= 3600 (1h min)
      createTx.pure.u64(envU64("TREASURY_FEE_BPS", "500")),
      createTx.pure.u64(envU64("KEEPER_BOUNTY", "100000")),
    ],
  });
  const createOut = await run(createTx, "create_and_share DepegCoverPool<SUI>");
  const pool = created(createOut, /::pyth_cover_pool::DepegCoverPool/);
  const adminCap = created(createOut, /::pyth_cover_pool::AdminCap/);
  const buyerCap = created(createOut, /::pyth_cover_pool::BuyerCap/);
  console.log(`   POOL=${pool}`);
  console.log(`   ADMIN_CAP=${adminCap} (held by ${addr})`);
  console.log(`   BUYER_CAP=${buyerCap}`);

  // 2. open the direct sale path.
  const openTx = new Transaction();
  openTx.moveCall({
    target: `${pkg}::pyth_cover_pool::set_direct_sales`,
    typeArguments: [SUI],
    arguments: [
      openTx.object(pool),
      openTx.object(adminCap),
      openTx.pure.bool(true),
    ],
  });
  await run(openTx, "set_direct_sales(true)");

  // 3. seed collateral so cover can be bought.
  const lpSeed = envU64("LP_SEED", "100000000"); // 0.1 SUI
  const depositTx = new Transaction();
  const [coin] = depositTx.splitCoins(depositTx.gas, [
    depositTx.pure.u64(lpSeed),
  ]);
  const share = depositTx.moveCall({
    target: `${pkg}::pyth_cover_pool::deposit_lp`,
    typeArguments: [SUI],
    arguments: [depositTx.object(pool), coin],
  });
  depositTx.transferObjects([share], addr);
  await run(depositTx, `deposit_lp ${lpSeed} mist`);

  console.log("\nOpen pool ready. Wire the app to:");
  console.log(`  PYTH_DEPEG_COVER_PKG = ${pkg}`);
  console.log(`  PYTH_DEPEG_POOL      = ${pool}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
