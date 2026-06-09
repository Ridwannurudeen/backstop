// Headless live mint: create_manager (once) + buy a real DOWN-binary crash-protection
// policy on the soonest active BTC market. Needs a funded testnet signer (SUI gas + DUSDC).
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import {
  PREDICT_PKG,
  PREDICT_OBJ,
  DUSDC,
  CLOCK,
  QTY_SCALE,
  STRIKE_SCALE,
  NETWORK,
  SERVER,
} from "./ids.js";
import {
  fetchActiveOracles,
  fetchReferencePrice,
  pickCrashStrikeUsd,
  quoteDownPrice,
} from "./pricing.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const MANAGER_FILE = join(HERE, "..", ".manager");

const SIZE_USD = BigInt(process.env.SIZE_USD ?? "10"); // protection size (≈ max payout)
const DEPOSIT_USD = BigInt(process.env.DEPOSIT_USD ?? "40"); // deposit to cover premium

function keypair(): Ed25519Keypair {
  const k = process.env.SUI_PRIVATE_KEY;
  if (!k) throw new Error("Set SUI_PRIVATE_KEY");
  return Ed25519Keypair.fromSecretKey(k.trim());
}

async function ensureManager(
  client: SuiClient,
  kp: Ed25519Keypair,
): Promise<string> {
  if (existsSync(MANAGER_FILE))
    return readFileSync(MANAGER_FILE, "utf8").trim();
  const tx = new Transaction();
  tx.moveCall({
    target: `${PREDICT_PKG}::predict::create_manager`,
    arguments: [],
  });
  const out = await client.signAndExecuteTransaction({
    signer: kp,
    transaction: tx,
    options: { showObjectChanges: true },
  });
  const mgr = (out.objectChanges ?? []).find(
    (c: any) => c.type === "created" && /Manager/i.test(c.objectType),
  ) as any;
  if (!mgr)
    throw new Error("create_manager: no Manager object in tx " + out.digest);
  writeFileSync(MANAGER_FILE, mgr.objectId);
  console.log(`created PredictManager ${mgr.objectId}  (${out.digest})`);
  return mgr.objectId;
}

async function main(): Promise<void> {
  const client = new SuiClient({ url: getFullnodeUrl(NETWORK) });
  const kp = keypair();
  const addr = kp.getPublicKey().toSuiAddress();

  const [oracles, ref] = await Promise.all([
    fetchActiveOracles("BTC"),
    fetchReferencePrice("BTC"),
  ]);
  if (!oracles.length) throw new Error("no active BTC oracles");
  const o = oracles[0];
  const strikeUsd = pickCrashStrikeUsd(ref?.priceUsd ?? null, o);
  console.log(
    `market: BTC < $${strikeUsd.toLocaleString()} · expiry ${new Date(Number(o.expiryMs)).toISOString()} · ref $${ref?.priceUsd?.toFixed(0) ?? "?"}`,
  );

  const quote = await quoteDownPrice(client, o, strikeUsd, addr, SIZE_USD);
  console.log(
    `quote: premium ${(Number(quote.premiumRaw) / 1e6).toFixed(4)} DUSDC for $${SIZE_USD} cover ` +
      `(implied crash prob ${(quote.impliedCrashProb * 100).toFixed(2)}%)`,
  );

  const manager = await ensureManager(client, kp);

  const { data } = await client.getCoins({ owner: addr, coinType: DUSDC });
  if (!data.length) throw new Error("no DUSDC in wallet");
  const tx = new Transaction();
  const primary = tx.object(data[0].coinObjectId);
  if (data.length > 1)
    tx.mergeCoins(
      primary,
      data.slice(1).map((c) => tx.object(c.coinObjectId)),
    );
  const [dep] = tx.splitCoins(primary, [tx.pure.u64(DEPOSIT_USD * QTY_SCALE)]);
  tx.moveCall({
    target: `${PREDICT_PKG}::predict_manager::deposit`,
    typeArguments: [DUSDC],
    arguments: [tx.object(manager), dep],
  });
  const key = tx.moveCall({
    target: `${PREDICT_PKG}::market_key::down`,
    arguments: [
      tx.pure.id(o.oracleId),
      tx.pure.u64(o.expiryMs),
      tx.pure.u64(strikeUsd * STRIKE_SCALE),
    ],
  });
  tx.moveCall({
    target: `${PREDICT_PKG}::predict::mint`,
    typeArguments: [DUSDC],
    arguments: [
      tx.object(PREDICT_OBJ),
      tx.object(manager),
      tx.object(o.oracleId),
      key,
      tx.pure.u64(SIZE_USD * QTY_SCALE),
      tx.object(CLOCK),
    ],
  });

  const out = await client.signAndExecuteTransaction({
    signer: kp,
    transaction: tx,
    options: { showEffects: true },
  });
  console.log(
    `MINT digest: ${out.digest} · status: ${out.effects?.status?.status}`,
  );
  if (out.effects?.status?.status !== "success")
    console.log("abort:", out.effects?.status?.error);
  console.log(`positions: ${SERVER}/managers/${manager}/positions/summary`);
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
