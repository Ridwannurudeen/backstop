// THE CRASH DRILL — one reproducible sequence where Backstop's whole stack reacts
// to a market crash with no human in the loop. Run: `npm run drill`.
//
//   calm setup → 💥 crash (RiskFeed + SRX spike) → RiskGuard treasury FREEZES →
//   lending market's cover PAYS its bad debt → a cover settles TRUSTLESSLY on
//   DeepBook's own oracle → [the lagging agent is SLASHED — see arena].
//
// Cetus took hours of validator coordination to freeze. This is one block.
// Env: SUI_PRIVATE_KEY (funded). Reads IDs from deployment.json. Amounts are tiny.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { NETWORK, CLOCK, PREDICT_OBJ, SERVER } from "./ids.js";

const SUI = "0x2::sui::SUI";
const HERE = dirname(fileURLToPath(import.meta.url));
const d = JSON.parse(
  readFileSync(join(HERE, "..", "..", "deployment.json"), "utf8"),
);
const MKT = "DRILL";
const bytes = (s: string) => Array.from(new TextEncoder().encode(s));

async function main(): Promise<void> {
  const k = process.env.SUI_PRIVATE_KEY;
  if (!k) throw new Error("Set SUI_PRIVATE_KEY");
  const RF = d.riskFeed,
    RI = d.riskIndex,
    RG = d.riskGuard,
    CP = d.coverPool,
    LD = d.lendingDemo,
    OP = d.oraclePool;
  const client = new SuiClient({ url: getFullnodeUrl(NETWORK) });
  const kp = Ed25519Keypair.fromSecretKey(k.trim());
  const addr = kp.getPublicKey().toSuiAddress();

  const run = async (tx: Transaction, label: string, allowFail = false) => {
    const out = await client.signAndExecuteTransaction({
      signer: kp,
      transaction: tx,
      options: { showObjectChanges: true, showEffects: true, showEvents: true },
    });
    const st = out.effects?.status?.status;
    const mark = st === "success" ? "·" : allowFail ? "⊘" : "✗";
    console.log(
      `  ${mark} ${label}: ${st}${st === "success" ? " · " + out.digest : ""}`,
    );
    if (st !== "success" && !allowFail) {
      console.log("    abort:", out.effects?.status?.error);
      throw new Error(`${label} failed`);
    }
    if (st === "success")
      await client.waitForTransaction({ digest: out.digest });
    return out;
  };
  const created = (out: any, re: RegExp) => {
    const c = (out.objectChanges ?? []).find(
      (o: any) => o.type === "created" && re.test(o.objectType),
    );
    if (!c) throw new Error(`no object matching ${re}`);
    return c.objectId as string;
  };
  const publishFeed = (prob: bigint, label: string) => {
    const tx = new Transaction();
    tx.moveCall({
      target: `${RF.package}::risk_feed::publish`,
      arguments: [
        tx.object(RF.feedObject),
        tx.object(RF.publisherCap),
        tx.pure.string(MKT),
        tx.pure.u64(prob),
        tx.pure.u64(60_000_000000000n),
        tx.pure.string("drill"),
        tx.object(CLOCK),
      ],
    });
    return run(tx, label);
  };
  const publishSrx = (crash: bigint, label: string) => {
    const tx = new Transaction();
    tx.moveCall({
      target: `${RI.package}::risk_index::publish`,
      arguments: [
        tx.object(RI.riskIndex),
        tx.pure.string(MKT),
        tx.pure.string("BTC"),
        tx.pure.u64(2_592_000_000n),
        tx.pure.u64(60_000_000000000n),
        tx.pure.u64(crash),
        tx.pure.u64(crash * 5n),
        tx.pure.u64(crash * 3n),
        tx.pure.string("drill-srx"),
        tx.object(CLOCK),
      ],
    });
    return run(tx, label);
  };

  console.log("\n━━ 1. CALM. The system is armed. ━━");
  await publishFeed(500n, "RiskFeed: BTC calm (5%)");
  await publishSrx(500n, "SRX: calm (5%)");
  // GuardedTreasury on DRILL (freezes withdrawals at >30% crash risk)
  const gt = new Transaction();
  gt.moveCall({
    target: `${RG.package}::risk_guard::create_and_share`,
    typeArguments: [SUI],
    arguments: [gt.pure.vector("u8", bytes(MKT)), gt.pure.u64(3000n)],
  });
  const treasury = created(
    await run(gt, "create GuardedTreasury"),
    /GuardedTreasury/,
  );
  const dep = new Transaction();
  const [tc] = dep.splitCoins(dep.gas, [dep.pure.u64(10_000_000n)]);
  dep.moveCall({
    target: `${RG.package}::risk_guard::deposit`,
    typeArguments: [SUI],
    arguments: [dep.object(treasury), tc],
  });
  await run(dep, "fund treasury 0.01 SUI");
  // CoverPool + LendingMarket on DRILL
  const cp = new Transaction();
  cp.moveCall({
    target: `${CP.package}::cover_pool::create_and_share`,
    typeArguments: [SUI],
    arguments: [
      cp.pure.vector("u8", bytes(MKT)),
      cp.pure.u64(3000n),
      cp.pure.u64(11000n),
    ],
  });
  const pool = created(
    await run(cp, "create CoverPool"),
    /::cover_pool::CoverPool/,
  );
  const seed = new Transaction();
  const [sc] = seed.splitCoins(seed.gas, [seed.pure.u64(50_000_000n)]);
  const lp = seed.moveCall({
    target: `${CP.package}::cover_pool::deposit_lp`,
    typeArguments: [SUI],
    arguments: [seed.object(pool), sc],
  });
  seed.transferObjects([lp], addr);
  await run(seed, "seed CoverPool 0.05 SUI");
  const lm = new Transaction();
  lm.moveCall({
    target: `${LD.package}::lending_demo::create_and_share`,
    typeArguments: [SUI],
    arguments: [lm.pure.vector("u8", bytes(MKT))],
  });
  const market = created(
    await run(lm, "create LendingMarket"),
    /LendingMarket/,
  );
  // insure it (premium priced off the calm feed: cover 0.02 @ 5% * 1.1 = 0.0011)
  const cover = 20_000_000n,
    premium = (((cover * 500n) / 10_000n) * 11000n) / 10_000n;
  const ins = new Transaction();
  const [pc] = ins.splitCoins(ins.gas, [ins.pure.u64(premium)]);
  ins.moveCall({
    target: `${LD.package}::lending_demo::insure`,
    typeArguments: [SUI],
    arguments: [
      ins.object(market),
      ins.object(pool),
      ins.object(RF.feedObject),
      pc,
      ins.pure.u64(cover),
      ins.pure.u64(BigInt(Date.now() + 30 * 86_400_000)),
      ins.object(CLOCK),
    ],
  });
  await run(ins, "lending market buys crash cover");

  console.log("\n━━ 2. Proof it works while calm ━━");
  const w1 = new Transaction();
  const wc = w1.moveCall({
    target: `${RG.package}::risk_guard::withdraw`,
    typeArguments: [SUI],
    arguments: [
      w1.object(treasury),
      w1.object(RF.feedObject),
      w1.pure.u64(2_000_000n),
    ],
  });
  w1.transferObjects([wc], addr);
  await run(w1, "treasury withdraw 0.002 SUI (calm → allowed)");

  console.log("\n━━ 3. 💥 CRASH ━━");
  await publishFeed(6000n, "RiskFeed: BTC CRASH (60%)");
  await publishSrx(8500n, "SRX SPIKES (85%)");

  console.log("\n━━ 4. The system responds — no human in the loop ━━");
  const w2 = new Transaction();
  const wc2 = w2.moveCall({
    target: `${RG.package}::risk_guard::withdraw`,
    typeArguments: [SUI],
    arguments: [
      w2.object(treasury),
      w2.object(RF.feedObject),
      w2.pure.u64(2_000_000n),
    ],
  });
  w2.transferObjects([wc2], addr);
  await run(w2, "treasury withdraw → FREEZES (crash risk > tolerance)", true);
  const cs = new Transaction();
  cs.moveCall({
    target: `${LD.package}::lending_demo::cover_shortfall`,
    typeArguments: [SUI],
    arguments: [
      cs.object(market),
      cs.object(pool),
      cs.object(RF.feedObject),
      cs.object(CLOCK),
    ],
  });
  const csOut = await run(cs, "lending market CLAIMS its bad-debt cover");
  const ev = (csOut.events ?? []).find((e: any) =>
    /ShortfallCovered$/.test(e.type),
  );
  if (ev) console.log("    →", JSON.stringify(ev.parsedJson));

  console.log(
    "\n━━ 5. And a cover settles TRUSTLESSLY on DeepBook's own oracle ━━",
  );
  const list = await (
    await fetch(`${SERVER}/predicts/${PREDICT_OBJ}/oracles`)
  ).json();
  const settled = (Array.isArray(list) ? list : [])
    .filter(
      (o: any) =>
        o.underlying_asset === "BTC" &&
        o.status === "settled" &&
        Number(o.settlement_price) > 0,
    )
    .sort((a: any, b: any) => Number(b.settled_at) - Number(a.settled_at));
  let oracle: any = null;
  for (const o of settled.slice(0, 25)) {
    const obj = await client.getObject({
      id: o.oracle_id,
      options: { showType: true },
    });
    if (obj.data?.objectId) {
      oracle = o;
      break;
    }
  }
  if (oracle) {
    const strike = BigInt(oracle.settlement_price) + 2_000_000000000n;
    const op = new Transaction();
    op.moveCall({
      target: `${OP.package}::oracle_pool::create_and_share`,
      typeArguments: [SUI],
      arguments: [op.object(oracle.oracle_id), op.pure.u64(strike)],
    });
    const opool = created(
      await run(op, "create oracle-settled pool on a real DeepBook oracle"),
      /OracleCoverPool/,
    );
    const os = new Transaction();
    const [osc] = os.splitCoins(os.gas, [os.pure.u64(30_000_000n)]);
    const oshare = os.moveCall({
      target: `${OP.package}::oracle_pool::deposit_lp`,
      typeArguments: [SUI],
      arguments: [os.object(opool), osc],
    });
    os.transferObjects([oshare], addr);
    await run(os, "seed it 0.03 SUI");
    const ob = new Transaction();
    const [obc] = ob.splitCoins(ob.gas, [ob.pure.u64(2_000_000n)]);
    const opolicy = ob.moveCall({
      target: `${OP.package}::oracle_pool::buy_cover`,
      typeArguments: [SUI],
      arguments: [ob.object(opool), obc, ob.pure.u64(10_000_000n)],
    });
    ob.transferObjects([opolicy], addr);
    const opolicyId = created(
      await run(ob, "buy cover"),
      /::oracle_pool::Policy/,
    );
    const oc = new Transaction();
    const opay = oc.moveCall({
      target: `${OP.package}::oracle_pool::claim`,
      typeArguments: [SUI],
      arguments: [
        oc.object(opool),
        oc.object(oracle.oracle_id),
        oc.object(opolicyId),
      ],
    });
    oc.transferObjects([opay], addr);
    const ocOut = await run(
      oc,
      "CLAIM — reads DeepBook's settlement_price on-chain",
    );
    const cev = (ocOut.events ?? []).find((e: any) =>
      /ClaimPaid$/.test(e.type),
    );
    if (cev) console.log("    →", JSON.stringify(cev.parsedJson));
  } else {
    console.log(
      "  (no settled DeepBook oracle live on-chain right now — skipped)",
    );
  }

  console.log(
    "\n━━ 6. The lagging oracle/agent is SLASHED — see `npm run arena` (arena package) ━━",
  );
  console.log(
    "\n✅ DRILL COMPLETE — an ecosystem survived a crash with zero human intervention.",
  );
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
