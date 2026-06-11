// Proof-of-judgment, LIVE: two bonded agents compete to call a crash; the one that
// keeps getting it wrong is SLASHED on-chain — rules-based, not discretionary.
// Agent 1 = the funded key (admin). Agent 2 = a throwaway key funded from it.
// Env: SUI_PRIVATE_KEY (funded). Reads IDs from deployment.json.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { bcs } from "@mysten/sui/bcs";
import { NETWORK } from "./ids.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const d = JSON.parse(
  readFileSync(join(HERE, "..", "..", "deployment.json"), "utf8"),
);
const A = d.arena;
const bytes = (s: string) => Array.from(new TextEncoder().encode(s));

async function main(): Promise<void> {
  const k = process.env.SUI_PRIVATE_KEY;
  if (!k) throw new Error("Set SUI_PRIVATE_KEY");
  const client = new SuiClient({ url: getFullnodeUrl(NETWORK) });
  const kp1 = Ed25519Keypair.fromSecretKey(k.trim()); // agent 1 + admin
  const a1 = kp1.getPublicKey().toSuiAddress();
  const kp2 = new Ed25519Keypair(); // agent 2 (throwaway)
  const a2 = kp2.getPublicKey().toSuiAddress();

  const run = async (
    tx: Transaction,
    signer: Ed25519Keypair,
    label: string,
  ) => {
    const out = await client.signAndExecuteTransaction({
      signer,
      transaction: tx,
      options: { showEffects: true, showEvents: true },
    });
    const st = out.effects?.status?.status;
    console.log(
      `  ${st === "success" ? "·" : "✗"} ${label}: ${st}${st === "success" ? " · " + out.digest : ""}`,
    );
    if (st !== "success") {
      console.log("    abort:", out.effects?.status?.error);
      throw new Error(`${label} failed`);
    }
    await client.waitForTransaction({ digest: out.digest });
    return out;
  };
  const enroll = (signer: Ed25519Keypair, name: string) => {
    const tx = new Transaction();
    const [bond] = tx.splitCoins(tx.gas, [tx.pure.u64(10_000_000n)]);
    tx.moveCall({
      target: `${A.package}::arena::enroll`,
      arguments: [tx.object(A.arena), tx.pure.vector("u8", bytes(name)), bond],
    });
    return run(tx, signer, `enroll ${name}`);
  };
  const quote = (signer: Ed25519Keypair, prob: bigint, who: string) => {
    const tx = new Transaction();
    tx.moveCall({
      target: `${A.package}::arena::quote`,
      arguments: [
        tx.object(A.arena),
        tx.pure.vector("u8", bytes("BTC")),
        tx.pure.u64(prob),
      ],
    });
    return run(tx, signer, `${who} quotes ${Number(prob) / 100}% crash prob`);
  };
  const settle = (crashed: boolean) => {
    const tx = new Transaction();
    tx.moveCall({
      target: `${A.package}::arena::settle_round`,
      arguments: [
        tx.object(A.arena),
        tx.object(A.adminCap),
        tx.pure.vector("u8", bytes("BTC")),
        tx.pure.bool(crashed),
      ],
    });
    return run(tx, kp1, `settle round (crashed=${crashed})`);
  };
  const view = async (fn: string, agent: string) => {
    const tx = new Transaction();
    tx.moveCall({
      target: `${A.package}::arena::${fn}`,
      arguments: [tx.object(A.arena), tx.pure.address(agent)],
    });
    const r = await client.devInspectTransactionBlock({
      sender: a1,
      transactionBlock: tx,
    });
    return Number(
      bcs.u64().parse(Uint8Array.from(r.results![0].returnValues![0][0])),
    );
  };

  console.log(
    `agent1 (Backstop AI) ${a1.slice(0, 10)}… · agent2 (LazyBot) ${a2.slice(0, 10)}…`,
  );

  console.log("\n━━ fund the challenger + both bond in ━━");
  const fund = new Transaction();
  const [g] = fund.splitCoins(fund.gas, [fund.pure.u64(40_000_000n)]);
  fund.transferObjects([g], a2);
  await run(fund, kp1, "fund agent2 with 0.04 SUI");
  await enroll(kp1, "Backstop AI");
  await enroll(kp2, "LazyBot");

  console.log("\n━━ round 1: BTC crashes ━━");
  await quote(kp1, 8200n, "Backstop AI"); // calls the crash
  await quote(kp2, 1500n, "LazyBot"); // misses
  await settle(true);

  console.log("\n━━ round 2: BTC crashes again ━━");
  await quote(kp1, 7600n, "Backstop AI"); // calls it again
  await quote(kp2, 1200n, "LazyBot"); // misses again
  await settle(true);

  console.log("\n━━ the leaderboard ━━");
  for (const [name, addr] of [
    ["Backstop AI", a1],
    ["LazyBot", a2],
  ] as const) {
    const acc = await view("accuracy_bps", addr),
      wins = await view("wins_of", addr),
      bond = await view("bond_of", addr);
    console.log(
      `  ${name}: accuracy ${acc / 100}% · wins ${wins} · bond ${bond / 1e9} SUI`,
    );
  }

  console.log("\n━━ LazyBot is miscalibrated (0%) → SLASHED on-chain ━━");
  const slashTx = new Transaction();
  const payout = slashTx.moveCall({
    target: `${A.package}::arena::slash_miscalibrated`,
    arguments: [
      slashTx.object(A.arena),
      slashTx.object(A.adminCap),
      slashTx.pure.address(a2),
      slashTx.pure.u64(5000n),
    ],
  });
  slashTx.transferObjects([payout], a1);
  const out = await run(slashTx, kp1, "slash_miscalibrated(LazyBot, min 50%)");
  const ev = (out.events ?? []).find((e: any) => /AgentSlashed$/.test(e.type));
  console.log("    →", JSON.stringify(ev?.parsedJson));
  console.log(
    `  LazyBot bond after slash: ${(await view("bond_of", a2)) / 1e9} SUI`,
  );
  console.log(
    `\n✅ Proof-of-judgment: an agent staked capital on its judgment and lost it for being wrong. slash tx ${out.digest}`,
  );
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
