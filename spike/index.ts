/**
 * Backstop spike — prove a "crash protection" DOWN-binary constructs, prices,
 * and (when funded) mints on the live DeepBook Predict BTC testnet oracle.
 *
 * Verified against MystenLabs/deepbookv3 @ tlee/predict-workshop (mintPosition.ts + README), 2026-06-06.
 * UNRESOLVED until you run `npm run check` (flagged inline):
 *   STRIKE_SCALE — workshop uses dollars*1e9; server min_strike looks ~1e6. --check tells you which the contract accepts.
 *   qty arg semantics + the PredictManager struct type (we match on "Manager") — confirm against predict.move if --live aborts.
 *
 *   npm run check   # devInspect: package liveness + create_manager + market_key::down. NO funds needed.
 *   npm run live    # create_manager + deposit + mint DOWN binary. Needs testnet SUI gas + DUSDC.
 */
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { PREDICT_PKG, PREDICT_OBJ, DUSDC, ORACLE, SERVER, CLOCK } from "./ids";

const LIVE = process.argv.includes("--live");
const STRIKE_SCALE = BigInt(process.env.STRIKE_SCALE ?? "1000000000"); // ×1e9 per workshop; try 1000000 if --check aborts
const QTY_SCALE = 1_000_000n;
const STRIKE_USD = BigInt(process.env.STRIKE_USD ?? "90000"); // insure against BTC < $90k
const QTY_USD = BigInt(process.env.QTY_USD ?? "5"); // $5 notional for the spike
const EXPIRY_MS = BigInt(process.env.EXPIRY_MS ?? "1780992000000"); // verified active expiry (~30d)
const MANAGER_FILE = new URL("./.manager", import.meta.url);

const client = new SuiClient({ url: getFullnodeUrl("testnet") });

function keypair() {
  const k = process.env.SUI_PRIVATE_KEY;
  if (!k)
    throw new Error(
      "Set SUI_PRIVATE_KEY (bech32 suiprivkey…). Get a testnet key + SUI at https://faucet.sui.io",
    );
  return Ed25519Keypair.fromSecretKey(k.trim());
}

async function activeOracleId(): Promise<string> {
  try {
    const r = await fetch(`${SERVER}/predicts/${PREDICT_OBJ}/oracles`);
    const body: any = await r.json();
    const list = Array.isArray(body) ? body : (body.oracles ?? body.data ?? []);
    const o = list.find(
      (x: any) =>
        x.status === "active" &&
        String(x.symbol ?? x.underlying ?? "")
          .toUpperCase()
          .includes("BTC"),
    );
    if (o) {
      console.log("active BTC oracle (raw):", JSON.stringify(o).slice(0, 300));
      return o.id ?? o.oracle_id ?? ORACLE;
    }
  } catch (e) {
    console.warn(
      "oracle fetch failed, using pinned ORACLE:",
      (e as Error).message,
    );
  }
  return ORACLE;
}

function addDownKey(tx: Transaction, oracleId: string) {
  const strike = STRIKE_USD * STRIKE_SCALE;
  return tx.moveCall({
    target: `${PREDICT_PKG}::market_key::down`,
    arguments: [
      tx.pure.id(oracleId),
      tx.pure.u64(EXPIRY_MS),
      tx.pure.u64(strike),
    ],
  });
}

async function runCheck() {
  const sender = keypair().getPublicKey().toSuiAddress();
  const oracleId = await activeOracleId();
  const tx = new Transaction();
  tx.moveCall({
    target: `${PREDICT_PKG}::predict::create_manager`,
    arguments: [],
  });
  addDownKey(tx, oracleId);
  const res = await client.devInspectTransactionBlock({
    sender,
    transactionBlock: tx,
  });
  console.log("status:", res.effects.status.status);
  if (res.effects.status.error)
    console.log(
      "abort:",
      res.effects.status.error,
      "→ if strike-related, set STRIKE_SCALE=1000000 and retry",
    );
  else
    console.log(
      "✓ package live + PTB valid. NOTE: market_key::down does NOT range-check strike (passes at any scale) — correct STRIKE_SCALE + the mint are confirmed only by --live. Tried scale:",
      STRIKE_SCALE.toString(),
    );
}

async function resolveManager(kp: Ed25519Keypair): Promise<string> {
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
  const created = (out.objectChanges ?? []).find(
    (c: any) =>
      c.type === "created" && String(c.objectType).includes("Manager"),
  ) as any;
  if (!created)
    throw new Error(
      "create_manager: no Manager object in objectChanges — inspect " +
        out.digest,
    );
  writeFileSync(MANAGER_FILE, created.objectId);
  console.log("created manager", created.objectId);
  return created.objectId;
}

async function runLive() {
  const kp = keypair();
  const addr = kp.getPublicKey().toSuiAddress();
  const oracleId = await activeOracleId();
  const manager = await resolveManager(kp);

  const coins = await client.getCoins({ owner: addr, coinType: DUSDC });
  if (!coins.data.length)
    throw new Error(
      "No DUSDC for " + addr + " — request testnet DUSDC first (gated form).",
    );

  const topup = QTY_USD * QTY_SCALE;
  const tx = new Transaction();
  const primary = tx.object(coins.data[0].coinObjectId);
  if (coins.data.length > 1)
    tx.mergeCoins(
      primary,
      coins.data.slice(1).map((c) => tx.object(c.coinObjectId)),
    );
  const [dep] = tx.splitCoins(primary, [tx.pure.u64(topup)]);
  tx.moveCall({
    target: `${PREDICT_PKG}::predict_manager::deposit`,
    typeArguments: [DUSDC],
    arguments: [tx.object(manager), dep],
  });
  const key = addDownKey(tx, oracleId);
  tx.moveCall({
    target: `${PREDICT_PKG}::predict::mint`,
    typeArguments: [DUSDC],
    arguments: [
      tx.object(PREDICT_OBJ),
      tx.object(manager),
      tx.object(oracleId),
      key,
      tx.pure.u64(topup),
      tx.object(CLOCK),
    ],
  });
  const out = await client.signAndExecuteTransaction({
    signer: kp,
    transaction: tx,
    options: { showEffects: true },
  });
  console.log("digest:", out.digest, "status:", out.effects?.status.status);
  console.log(
    "→ read your position at",
    `${SERVER}/predicts/${PREDICT_OBJ}/positions?owner=${addr}`,
  );
}

(LIVE ? runLive() : runCheck()).catch((e) => {
  console.error("SPIKE FAILED:", e.message);
  process.exit(1);
});
