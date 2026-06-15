// Generic Move package publisher (gas only). Prints the new package id and every
// object created by the package's init (shared objects + caps), with their types.
// Expects BYTECODE_JSON = path to `sui move build --dump-bytecode-as-base64` output.
import { readFileSync } from "node:fs";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { NETWORK } from "./ids.js";

async function main(): Promise<void> {
  const f = process.env.BYTECODE_JSON;
  if (!f) throw new Error("Set BYTECODE_JSON");
  const k = process.env.SUI_PRIVATE_KEY;
  if (!k) throw new Error("Set SUI_PRIVATE_KEY");
  const { modules, dependencies } = JSON.parse(readFileSync(f, "utf8")) as {
    modules: string[];
    dependencies: string[];
  };

  // Defaults to the repo network (testnet); set DEPLOY_NETWORK=mainnet to publish
  // the Pyth-settled packages (pyth_cover_pool / pyth_lending_demo) to mainnet.
  const net = (process.env.DEPLOY_NETWORK ?? NETWORK) as
    | "mainnet"
    | "testnet"
    | "devnet"
    | "localnet";
  console.log(`network: ${net}`);
  const client = new SuiClient({ url: getFullnodeUrl(net) });
  const kp = Ed25519Keypair.fromSecretKey(k.trim());
  const addr = kp.getPublicKey().toSuiAddress();

  const tx = new Transaction();
  const upgradeCap = tx.publish({ modules, dependencies });
  tx.transferObjects([upgradeCap], addr);

  const out = await client.signAndExecuteTransaction({
    signer: kp,
    transaction: tx,
    options: { showObjectChanges: true, showEffects: true },
  });
  console.log(`publish: ${out.effects?.status?.status} · digest ${out.digest}`);
  if (out.effects?.status?.status !== "success") {
    console.log("abort:", out.effects?.status?.error);
    return;
  }
  for (const c of (out.objectChanges ?? []) as any[]) {
    if (c.type === "published") console.log(`PACKAGE=${c.packageId}`);
    else if (c.type === "created")
      console.log(`created ${c.objectType}  ${c.objectId}`);
  }
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
