// Provision + prove the three "widen scope" primitives on testnet, end-to-end:
//   A. Accountability — register a bonded AgentPassport, record 2 predictions on the
//      CalibrationLedger, settle them vs realized outcome → on-chain accuracy/Brier.
//   B. PoolRegistry — register the live cover pools by market key.
//   C. lending_demo — a LendingMarket buys cover from a live CoverPool and claims the
//      payout into its reserve when the market crashes (bad-debt backstop).
// Reads all IDs from deployment.json. Env: SUI_PRIVATE_KEY (funded).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { NETWORK, CLOCK } from "./ids.js";

const SUI = "0x2::sui::SUI";
const HERE = dirname(fileURLToPath(import.meta.url));
const d = JSON.parse(
  readFileSync(join(HERE, "..", "..", "deployment.json"), "utf8"),
);

const bytes = (s: string) => Array.from(new TextEncoder().encode(s));
const premiumFor = (cover: bigint, prob: bigint, load: bigint) =>
  (((cover * prob) / 10_000n) * load) / 10_000n;

async function main(): Promise<void> {
  const k = process.env.SUI_PRIVATE_KEY;
  if (!k) throw new Error("Set SUI_PRIVATE_KEY");
  const client = new SuiClient({ url: getFullnodeUrl(NETWORK) });
  const kp = Ed25519Keypair.fromSecretKey(k.trim());
  const addr = kp.getPublicKey().toSuiAddress();

  const ACC = d.accountability,
    REG = d.poolRegistry,
    LEND = d.lendingDemo;
  const CP = d.coverPool,
    RF = d.riskFeed;

  const run = async (tx: Transaction, label: string) => {
    const out = await client.signAndExecuteTransaction({
      signer: kp,
      transaction: tx,
      options: { showObjectChanges: true, showEffects: true, showEvents: true },
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
  const created = (out: any, re: RegExp) => {
    const c = (out.objectChanges ?? []).find(
      (o: any) => o.type === "created" && re.test(o.objectType),
    );
    if (!c) throw new Error(`no created object matching ${re}`);
    return c.objectId as string;
  };

  console.log("\n=== A. Accountability ===");
  // register a bonded passport (0.05 SUI bond)
  const regTx = new Transaction();
  const [bond] = regTx.splitCoins(regTx.gas, [regTx.pure.u64(50_000_000n)]);
  regTx.moveCall({
    target: `${ACC.package}::passport::register`,
    arguments: [
      regTx.pure.vector("u8", bytes("Backstop AI Underwriter")),
      bond,
      regTx.object(ACC.calibrationLedger),
      regTx.object(CLOCK),
    ],
  });
  const a1 = await run(regTx, "register passport (0.05 SUI bond)");
  const passport = created(a1, /::passport::AgentPassport/);
  console.log(`   PASSPORT=${passport}`);

  // record 2 predictions (fresh ledger -> ids 0,1) + note a decision
  const recTx = new Transaction();
  const preds: [string, bigint][] = [
    ["BTC<56868@1782460800000", 2907n],
    ["BTC<56868@1781251200000", 1376n],
  ];
  for (const [market, prob] of preds) {
    recTx.moveCall({
      target: `${ACC.package}::calibration::record_prediction`,
      arguments: [
        recTx.object(ACC.calibrationLedger),
        recTx.object(ACC.adminCap),
        recTx.pure.string(market),
        recTx.pure.u64(prob),
        recTx.pure.string("walrus-evidence"),
        recTx.object(CLOCK),
      ],
    });
  }
  recTx.moveCall({
    target: `${ACC.package}::passport::note_decision`,
    arguments: [recTx.object(passport), recTx.object(ACC.adminCap)],
  });
  await run(recTx, "record 2 predictions + note decision");

  // settle both (no crash -> predicted <50% was correct -> 2/2 hits)
  const setTx = new Transaction();
  for (const id of [0n, 1n]) {
    setTx.moveCall({
      target: `${ACC.package}::calibration::settle_prediction`,
      arguments: [
        setTx.object(ACC.calibrationLedger),
        setTx.object(ACC.adminCap),
        setTx.pure.u64(id),
        setTx.pure.bool(false),
        setTx.object(CLOCK),
      ],
    });
  }
  await run(setTx, "settle 2 predictions (no crash)");

  console.log("\n=== B. PoolRegistry ===");
  const pools: [string, string, bigint, bigint][] = [
    ["BTC-CRASH-30D", CP.publicPool.pool, 3000n, 11000n],
    ["DEMO-CRASH", CP.demo.pool, 5000n, 11000n],
  ];
  const regPoolsTx = new Transaction();
  for (const [market, pid, trig, load] of pools) {
    regPoolsTx.moveCall({
      target: `${REG.package}::pool_registry::register`,
      arguments: [
        regPoolsTx.object(REG.registry),
        regPoolsTx.object(REG.registryCap),
        regPoolsTx.pure.string(market),
        regPoolsTx.pure.id(pid),
        regPoolsTx.pure.u64(trig),
        regPoolsTx.pure.u64(load),
        regPoolsTx.object(CLOCK),
      ],
    });
  }
  await run(regPoolsTx, "register 2 pools in the registry");

  console.log("\n=== C. lending_demo (bad-debt backstop) ===");
  const LM = "LEND-DEMO";
  const publish = (prob: bigint, label: string) => {
    const tx = new Transaction();
    tx.moveCall({
      target: `${RF.package}::risk_feed::publish`,
      arguments: [
        tx.object(RF.feedObject),
        tx.object(RF.publisherCap),
        tx.pure.string(LM),
        tx.pure.u64(prob),
        tx.pure.u64(60_000_000000000n),
        tx.pure.string("lending-demo"),
        tx.object(CLOCK),
      ],
    });
    return run(tx, label);
  };
  await publish(800n, "publish calm reading on LEND-DEMO");

  const cpTx = new Transaction();
  cpTx.moveCall({
    target: `${CP.package}::cover_pool::create_and_share`,
    typeArguments: [SUI],
    arguments: [
      cpTx.pure.vector("u8", bytes(LM)),
      cpTx.pure.u64(3000n),
      cpTx.pure.u64(11000n),
    ],
  });
  const c2 = await run(cpTx, "create LEND-DEMO cover pool");
  const pool = created(c2, /::cover_pool::CoverPool/);
  console.log(`   POOL=${pool}`);

  const seedTx = new Transaction();
  const [seed] = seedTx.splitCoins(seedTx.gas, [seedTx.pure.u64(50_000_000n)]);
  const share = seedTx.moveCall({
    target: `${CP.package}::cover_pool::deposit_lp`,
    typeArguments: [SUI],
    arguments: [seedTx.object(pool), seed],
  });
  seedTx.transferObjects([share], addr);
  await run(seedTx, "seed LEND-DEMO pool 0.05 SUI");

  const lmTx = new Transaction();
  lmTx.moveCall({
    target: `${LEND.package}::lending_demo::create_and_share`,
    typeArguments: [SUI],
    arguments: [lmTx.pure.vector("u8", bytes(LM))],
  });
  const c3 = await run(lmTx, "create LendingMarket");
  const market = created(c3, /::lending_demo::LendingMarket/);
  console.log(`   MARKET=${market}`);

  const cover = 20_000_000n;
  const premium = premiumFor(cover, 800n, 11000n);
  const expiry = BigInt(Date.now() + 30 * 86_400_000);
  const insTx = new Transaction();
  const [prem] = insTx.splitCoins(insTx.gas, [insTx.pure.u64(premium)]);
  insTx.moveCall({
    target: `${LEND.package}::lending_demo::insure`,
    typeArguments: [SUI],
    arguments: [
      insTx.object(market),
      insTx.object(pool),
      insTx.object(RF.feedObject),
      prem,
      insTx.pure.u64(cover),
      insTx.pure.u64(expiry),
      insTx.object(CLOCK),
    ],
  });
  await run(insTx, `insure LendingMarket (cover ${cover}, premium ${premium})`);

  await publish(6000n, "publish CRASH reading on LEND-DEMO");

  const csTx = new Transaction();
  csTx.moveCall({
    target: `${LEND.package}::lending_demo::cover_shortfall`,
    typeArguments: [SUI],
    arguments: [
      csTx.object(market),
      csTx.object(pool),
      csTx.object(RF.feedObject),
      csTx.object(CLOCK),
    ],
  });
  const c4 = await run(csTx, "cover_shortfall (claim payout into reserve)");
  const ev = (c4.events ?? []).find((e: any) =>
    /::lending_demo::ShortfallCovered$/.test(e.type),
  );
  console.log("   ShortfallCovered:", JSON.stringify(ev?.parsedJson));

  console.log("\n=== summary (record in deployment.json) ===");
  console.log(`PASSPORT=${passport}`);
  console.log(`registerPassportDigest=${a1.digest}`);
  console.log(`LEND_POOL=${pool}`);
  console.log(`LENDING_MARKET=${market}`);
  console.log(`coverShortfallDigest=${c4.digest}`);
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
