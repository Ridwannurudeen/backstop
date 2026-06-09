// Headless live run. Each phase is independent so a faucet rate-limit can't block the no-funds quote.
//   Phase A (no funds): real get_trade_amounts quote via devInspect — resolves the premium/payout label.
//   Phase B (needs gas): faucet SUI -> real create_manager. Best-effort (faucet is IP rate-limited here).
//   The buy (mint) + underwrite (supply) need gated DUSDC and are not attempted.
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { bcs } from "@mysten/sui/bcs";
import * as faucet from "@mysten/sui/faucet";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const PREDICT_PKG = "0x" + "f5ea2b3749c65d6e56507cc35388719a" + "adb28f9cab873696a2f8687f5c785138";
const PREDICT_OBJ = "0x" + "c8736204d12f0a7277c86388a68bf8a1" + "94b0a14c5538ad13f22cbd8e2a38028a";
const SERVER = "https://predict-server.testnet.mystenlabs.com";
const CLOCK = "0x6";
const QTY_SCALE = 1_000_000n;
const STRIKE_SCALE = 1_000_000_000n;

const client = new SuiClient({ url: getFullnodeUrl("testnet") });

let kp;
if (existsSync(".localkey")) kp = Ed25519Keypair.fromSecretKey(readFileSync(".localkey", "utf8").trim());
else {
  kp = Ed25519Keypair.generate();
  writeFileSync(".localkey", kp.getSecretKey());
}
const addr = kp.getPublicKey().toSuiAddress();
console.log("address:", addr);

// ---- Phase A: live quote (no funds) ----
try {
  const oracles = await (await fetch(`${SERVER}/predicts/${PREDICT_OBJ}/oracles`)).json();
  const list = Array.isArray(oracles) ? oracles : [];
  const active = list.filter((o) => o.status === "active" && o.underlying_asset === "BTC").sort((a, b) => a.expiry - b.expiry);
  const settled = list.filter((o) => o.status === "settled" && Number(o.settlement_price) > 0).sort((a, b) => b.settled_at - a.settled_at);
  const refUsd = settled.length ? Number(settled[0].settlement_price) / Number(STRIKE_SCALE) : 60000;
  console.log(`active BTC oracles: ${active.length}, reference (last settled): $${refUsd.toFixed(0)}`);
  if (active.length) {
    const o = active[0];
    const strikeUsd = Math.max(50000, Math.round((refUsd * 0.9) / 1000) * 1000);
    const qty = 5n * QTY_SCALE;
    const tx = new Transaction();
    const key = tx.moveCall({
      target: `${PREDICT_PKG}::market_key::down`,
      arguments: [tx.pure.id(o.oracle_id), tx.pure.u64(BigInt(o.expiry)), tx.pure.u64(BigInt(strikeUsd) * STRIKE_SCALE)],
    });
    tx.moveCall({
      target: `${PREDICT_PKG}::predict::get_trade_amounts`,
      arguments: [tx.object(PREDICT_OBJ), tx.object(o.oracle_id), key, tx.pure.u64(qty), tx.object(CLOCK)],
    });
    const res = await client.devInspectTransactionBlock({ sender: addr, transactionBlock: tx });
    console.log(`quote: DOWN BTC<$${strikeUsd}, $5 size -> status ${res.effects.status.status}`);
    if (res.effects.status.error) console.log("  abort:", res.effects.status.error);
    const rv = res.results?.[res.results.length - 1]?.returnValues;
    if (rv && rv.length >= 2) {
      const a = Number(bcs.u64().parse(Uint8Array.from(rv[0][0]))) / Number(QTY_SCALE);
      const b = Number(bcs.u64().parse(Uint8Array.from(rv[1][0]))) / Number(QTY_SCALE);
      console.log(`  returnValues: [${a}, ${b}]  (smaller≈premium, larger≈max payout=size)`);
    }
  }
} catch (e) {
  console.log("QUOTE phase error:", e.message);
}

// ---- Phase B: faucet + create_manager (best-effort) ----
async function suiBalance() {
  return BigInt((await client.getBalance({ owner: addr })).totalBalance);
}
try {
  if ((await suiBalance()) < 100_000_000n) {
    const host = faucet.getFaucetHost("testnet");
    const req = faucet.requestSuiFromFaucetV2 ?? faucet.requestSuiFromFaucetV1 ?? faucet.requestSuiFromFaucetV0;
    console.log("requesting SUI from faucet…");
    await req({ host, recipient: addr });
    for (let i = 0; i < 20 && (await suiBalance()) < 100_000_000n; i++) await new Promise((r) => setTimeout(r, 3000));
  }
  const bal = await suiBalance();
  console.log("SUI balance:", bal.toString());
  if (bal >= 100_000_000n) {
    let managerId = existsSync(".localmanager") ? readFileSync(".localmanager", "utf8").trim() : null;
    if (!managerId) {
      const tx = new Transaction();
      tx.moveCall({ target: `${PREDICT_PKG}::predict::create_manager`, arguments: [] });
      const out = await client.signAndExecuteTransaction({ signer: kp, transaction: tx, options: { showObjectChanges: true, showEffects: true } });
      console.log("create_manager status:", out.effects?.status?.status, "digest:", out.digest);
      (out.objectChanges ?? []).filter((c) => c.type === "created").forEach((c) => console.log("  created:", c.objectType, c.objectId));
      const mgr = (out.objectChanges ?? []).find((c) => c.type === "created" && /Manager/i.test(c.objectType));
      if (mgr) {
        managerId = mgr.objectId;
        writeFileSync(".localmanager", managerId);
      }
    }
    console.log("manager:", managerId ?? "NOT CREATED");
  } else {
    console.log("create_manager SKIPPED — no gas (faucet rate-limited). Retry later or fund", addr, "manually.");
  }
} catch (e) {
  console.log("FAUCET/MANAGER phase error:", e.message);
}
