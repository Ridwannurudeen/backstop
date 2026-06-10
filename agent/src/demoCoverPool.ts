// Prove the Backstop CoverPool END-TO-END against the LIVE RiskFeed, on testnet:
//   1. publish a calm reading on a dedicated DEMO market (we hold the PublisherCap)
//   2. create_and_share a CoverPool<SUI> for that market
//   3. an LP deposits SUI (underwriting-as-yield)
//   4. a policyholder buys parametric cover — premium priced off the feed
//   5. publish a reading above the trigger (the "crash")
//   6. the holder claims — a real SUI payout settles straight from the pool
//
// This is the crash -> payout money-shot the Predict IMM structurally blocks
// (assert_mintable_ask on ITM asks); here the pool itself underwrites and settles.
//
// Env: SUI_PRIVATE_KEY (funded), COVER_POOL_PKG, RISK_FEED_PKG, RISK_FEED_OBJ,
//      PUBLISHER_CAP. Optional: DEMO_MARKET (default "DEMO-CRASH").
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { NETWORK, CLOCK } from "./ids.js";

const SUI = "0x2::sui::SUI";

// Demo parameters (SUI mist).
const LP_DEPOSIT = 50_000_000n; // 0.05 SUI of LP capital
const COVER = 20_000_000n; // 0.02 SUI of cover
const TRIGGER_BPS = 5000n; // claim pays at >= 50% implied crash prob
const LOADING_BPS = 11_000n; // 1.1x fair premium
const CALM_BPS = 1000n; // 10% before the crash
const CRASH_BPS = 6000n; // 60% — past the trigger
const REF_PRICE = 60_000_000000000n; // 1e9-scaled reference price, for context

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Set ${name}`);
  return v;
}

// Fair premium, integer math identical to cover_pool::premium_for.
function premiumFor(
  cover: bigint,
  probBps: bigint,
  loadingBps: bigint,
): bigint {
  const fair = (cover * probBps) / 10_000n;
  return (fair * loadingBps) / 10_000n;
}

async function main(): Promise<void> {
  const POOL_PKG = env("COVER_POOL_PKG");
  const FEED_PKG = env("RISK_FEED_PKG");
  const FEED = env("RISK_FEED_OBJ");
  const CAP = env("PUBLISHER_CAP");
  const market = process.env.DEMO_MARKET ?? "DEMO-CRASH";

  const client = new SuiClient({ url: getFullnodeUrl(NETWORK) });
  const kp = Ed25519Keypair.fromSecretKey(env("SUI_PRIVATE_KEY").trim());
  const addr = kp.getPublicKey().toSuiAddress();

  const run = async (tx: Transaction, label: string) => {
    const out = await client.signAndExecuteTransaction({
      signer: kp,
      transaction: tx,
      options: { showObjectChanges: true, showEffects: true, showEvents: true },
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
  const created = (
    out: Awaited<ReturnType<typeof run>>,
    re: RegExp,
  ): string => {
    const c = (out.objectChanges ?? []).find(
      (o: any) => o.type === "created" && re.test(o.objectType),
    ) as any;
    if (!c) throw new Error(`no created object matching ${re}`);
    return c.objectId;
  };

  const publishReading = (probBps: bigint) => {
    const tx = new Transaction();
    tx.moveCall({
      target: `${FEED_PKG}::risk_feed::publish`,
      arguments: [
        tx.object(FEED),
        tx.object(CAP),
        tx.pure.string(market),
        tx.pure.u64(probBps),
        tx.pure.u64(REF_PRICE),
        tx.pure.string("demo-cover-pool"),
        tx.object(CLOCK),
      ],
    });
    return tx;
  };

  // 1) calm reading establishes the market
  await run(
    publishReading(CALM_BPS),
    `1. publish calm reading (${CALM_BPS}bps)`,
  );

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
  const pool = created(c2, /CoverPool/);
  console.log(`   POOL=${pool}`);

  // 3) LP deposits capital
  const depTx = new Transaction();
  const [lpCoin] = depTx.splitCoins(depTx.gas, [depTx.pure.u64(LP_DEPOSIT)]);
  const lpShare = depTx.moveCall({
    target: `${POOL_PKG}::cover_pool::deposit_lp`,
    typeArguments: [SUI],
    arguments: [depTx.object(pool), lpCoin],
  });
  depTx.transferObjects([lpShare], addr);
  await run(depTx, `3. LP deposit ${LP_DEPOSIT} mist`);

  // 4) policyholder buys cover — premium priced off the calm reading
  const premium = premiumFor(COVER, CALM_BPS, LOADING_BPS);
  const expiryMs = BigInt(Date.now() + 86_400_000); // +1 day
  const buyTx = new Transaction();
  const [premCoin] = buyTx.splitCoins(buyTx.gas, [buyTx.pure.u64(premium)]);
  const policyObj = buyTx.moveCall({
    target: `${POOL_PKG}::cover_pool::buy_cover`,
    typeArguments: [SUI],
    arguments: [
      buyTx.object(pool),
      buyTx.object(FEED),
      premCoin,
      buyTx.pure.u64(COVER),
      buyTx.pure.u64(expiryMs),
      buyTx.object(CLOCK),
    ],
  });
  buyTx.transferObjects([policyObj], addr);
  const c4 = await run(buyTx, `4. buy cover ${COVER} for ${premium} premium`);
  const policy = created(c4, /::cover_pool::Policy/);
  console.log(`   POLICY=${policy}`);

  // 5) the crash — reading jumps past the trigger
  await run(
    publishReading(CRASH_BPS),
    `5. publish crash reading (${CRASH_BPS}bps)`,
  );

  // 6) claim — real SUI payout settles from the pool
  const claimTx = new Transaction();
  const payout = claimTx.moveCall({
    target: `${POOL_PKG}::cover_pool::claim`,
    typeArguments: [SUI],
    arguments: [
      claimTx.object(pool),
      claimTx.object(FEED),
      claimTx.object(policy),
      claimTx.object(CLOCK),
    ],
  });
  claimTx.transferObjects([payout], addr);
  const c6 = await run(claimTx, "6. claim payout");
  const claimed = (c6.events ?? []).find((e: any) =>
    /::cover_pool::Claimed$/.test(e.type),
  ) as any;
  console.log("   Claimed event:", JSON.stringify(claimed?.parsedJson));
  console.log(
    "\nDone — deposit -> buy -> crash -> on-chain payout, all on testnet.",
  );
  console.log(`POOL=${pool}`);
  console.log(`buy_digest=${c4.digest}`);
  console.log(`claim_digest=${c6.digest}`);
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
