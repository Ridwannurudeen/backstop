// Anchor the agent's latest readings into the on-chain RiskFeed (Pillar I).
// Reads out/decisions.json (probability + Walrus proof per market) and calls
// risk_feed::publish for each, in one PTB. Needs a funded testnet signer (gas)
// and the published package IDs — see contracts/risk_feed/DEPLOY.md.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { NETWORK, CLOCK } from "./ids.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const DECISIONS_JSON = join(HERE, "..", "out", "decisions.json");

function req(name: string): string {
  const v = process.env[name];
  if (!v)
    throw new Error(
      `Set ${name} (from the published RiskFeed package) — see contracts/risk_feed/DEPLOY.md`,
    );
  return v;
}

function keypair(): Ed25519Keypair {
  const k = process.env.SUI_PRIVATE_KEY;
  if (!k)
    throw new Error(
      "Set SUI_PRIVATE_KEY (a funded testnet key) — publishing needs gas.",
    );
  return Ed25519Keypair.fromSecretKey(k.trim());
}

type Decision = {
  input: {
    symbol: string;
    strikeUsd: number;
    expiryMs: string;
    referencePriceUsd: number | null;
    impliedCrashProb: number;
  };
  walrusBlobId: string | null;
};

async function main(): Promise<void> {
  const PKG = req("RISK_FEED_PKG");
  const FEED = req("RISK_FEED_OBJ");
  const CAP = req("PUBLISHER_CAP");

  const client = new SuiClient({ url: getFullnodeUrl(NETWORK) });
  const kp = keypair();

  const file = JSON.parse(await readFile(DECISIONS_JSON, "utf8")) as {
    decisions: Decision[];
  };
  const decisions = file.decisions ?? [];
  if (!decisions.length)
    throw new Error(
      "no decisions in out/decisions.json — run `npm run once` first.",
    );

  const tx = new Transaction();
  for (const d of decisions) {
    const market = `${d.input.symbol}<${d.input.strikeUsd}@${d.input.expiryMs}`;
    const probBps = Math.min(
      10000,
      Math.max(0, Math.round(d.input.impliedCrashProb * 10000)),
    );
    const refPrice = BigInt(Math.round((d.input.referencePriceUsd ?? 0) * 1e9));
    tx.moveCall({
      target: `${PKG}::risk_feed::publish`,
      arguments: [
        tx.object(FEED),
        tx.object(CAP),
        tx.pure.string(market),
        tx.pure.u64(probBps),
        tx.pure.u64(refPrice),
        tx.pure.string(d.walrusBlobId ?? ""),
        tx.object(CLOCK),
      ],
    });
  }

  const out = await client.signAndExecuteTransaction({
    signer: kp,
    transaction: tx,
    options: { showEffects: true },
  });
  console.log(
    `published ${decisions.length} reading(s) -> ${out.digest} (${out.effects?.status?.status})`,
  );
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
