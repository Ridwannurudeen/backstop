// Prove TRUSTLESS settlement: an oracle_pool claim that pays by reading DeepBook
// Predict's OWN settled oracle on-chain — no Backstop feed in the path.
//   1. find a settled BTC oracle (still live on-chain)
//   2. create an OracleCoverPool bound to it, strike above the settlement price
//      (so the DOWN binary is in-the-money)
//   3. seed LP + buy cover
//   4. claim — reads oracle::is_settled + settlement_price on-chain → pays
// Env: SUI_PRIVATE_KEY (funded). Reads IDs from deployment.json + predict-server.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { NETWORK, PREDICT_OBJ, SERVER } from "./ids.js";

const SUI = "0x2::sui::SUI";
const HERE = dirname(fileURLToPath(import.meta.url));
const d = JSON.parse(
  readFileSync(join(HERE, "..", "..", "deployment.json"), "utf8"),
);

async function main(): Promise<void> {
  const k = process.env.SUI_PRIVATE_KEY;
  if (!k) throw new Error("Set SUI_PRIVATE_KEY");
  const OP = d.oraclePool.package;
  const client = new SuiClient({ url: getFullnodeUrl(NETWORK) });
  const kp = Ed25519Keypair.fromSecretKey(k.trim());
  const addr = kp.getPublicKey().toSuiAddress();

  // Find a settled BTC oracle whose object still exists on-chain.
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
  if (!oracle) throw new Error("no settled oracle object still live on-chain");
  const settlementRaw = BigInt(oracle.settlement_price);
  const strike = settlementRaw + 2_000_000000000n; // $2000 above settlement -> ITM
  console.log(
    `settled oracle ${oracle.oracle_id.slice(0, 12)}… · settled $${(Number(settlementRaw) / 1e9).toFixed(0)} · strike $${(Number(strike) / 1e9).toFixed(0)}`,
  );

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

  // 1) pool bound to the settled DeepBook oracle
  const createTx = new Transaction();
  createTx.moveCall({
    target: `${OP}::oracle_pool::create_and_share`,
    typeArguments: [SUI],
    arguments: [createTx.object(oracle.oracle_id), createTx.pure.u64(strike)],
  });
  const c1 = await run(createTx, "create pool bound to settled oracle");
  const pool = created(c1, /::oracle_pool::OracleCoverPool/);
  console.log(`   POOL=${pool}`);

  // 2) seed LP 0.05 SUI
  const seedTx = new Transaction();
  const [seed] = seedTx.splitCoins(seedTx.gas, [seedTx.pure.u64(50_000_000n)]);
  const share = seedTx.moveCall({
    target: `${OP}::oracle_pool::deposit_lp`,
    typeArguments: [SUI],
    arguments: [seedTx.object(pool), seed],
  });
  seedTx.transferObjects([share], addr);
  await run(seedTx, "seed LP 0.05 SUI");

  // 3) buy 0.02 SUI of cover for a 0.005 SUI premium
  const buyTx = new Transaction();
  const [prem] = buyTx.splitCoins(buyTx.gas, [buyTx.pure.u64(5_000_000n)]);
  const policy = buyTx.moveCall({
    target: `${OP}::oracle_pool::buy_cover`,
    typeArguments: [SUI],
    arguments: [buyTx.object(pool), prem, buyTx.pure.u64(20_000_000n)],
  });
  buyTx.transferObjects([policy], addr);
  const c3 = await run(buyTx, "buy cover (0.02 SUI)");
  const policyId = created(c3, /::oracle_pool::Policy/);

  // 4) THE TRUSTLESS CLAIM — reads DeepBook's settled oracle on-chain
  const claimTx = new Transaction();
  const payout = claimTx.moveCall({
    target: `${OP}::oracle_pool::claim`,
    typeArguments: [SUI],
    arguments: [
      claimTx.object(pool),
      claimTx.object(oracle.oracle_id),
      claimTx.object(policyId),
    ],
  });
  claimTx.transferObjects([payout], addr);
  const c4 = await run(claimTx, "CLAIM (trustless, reads DeepBook oracle)");
  const ev = (c4.events ?? []).find((e: any) =>
    /::oracle_pool::ClaimPaid$/.test(e.type),
  );
  console.log("   ClaimPaid:", JSON.stringify(ev?.parsedJson));
  console.log(
    `\nTrustless settlement proven — claim read DeepBook's settlement on-chain.`,
  );
  console.log(
    `POOL=${pool}\noracle=${oracle.oracle_id}\nclaim_digest=${c4.digest}`,
  );
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
