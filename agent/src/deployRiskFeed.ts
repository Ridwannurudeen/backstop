// Publish the compiled RiskFeed Move package on testnet via the SDK (gas only).
// Expects BYTECODE_JSON = path to the output of `sui move build --dump-bytecode-as-base64`.
import { readFileSync } from "node:fs";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { NETWORK } from "./ids.js";

function keypair(): Ed25519Keypair {
  const k = process.env.SUI_PRIVATE_KEY;
  if (!k) throw new Error("Set SUI_PRIVATE_KEY");
  return Ed25519Keypair.fromSecretKey(k.trim());
}

async function main(): Promise<void> {
  const f = process.env.BYTECODE_JSON;
  if (!f)
    throw new Error(
      "Set BYTECODE_JSON (path to sui move build --dump-bytecode-as-base64 output)",
    );
  const { modules, dependencies } = JSON.parse(readFileSync(f, "utf8")) as {
    modules: string[];
    dependencies: string[];
  };

  const client = new SuiClient({ url: getFullnodeUrl(NETWORK) });
  const kp = keypair();
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
  const ch = (out.objectChanges ?? []) as any[];
  const pkg = ch.find((c) => c.type === "published");
  const feed = ch.find(
    (c) => c.type === "created" && /RiskFeed/.test(c.objectType),
  );
  const cap = ch.find(
    (c) => c.type === "created" && /PublisherCap/.test(c.objectType),
  );
  console.log("RISK_FEED_PKG=" + pkg?.packageId);
  console.log("RISK_FEED_OBJ=" + feed?.objectId);
  console.log("PUBLISHER_CAP=" + cap?.objectId);
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
