import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import {
  NETWORK,
  QTY_SCALE,
  WALRUS_AGGREGATOR,
  PREDICT_PKG,
  PREDICT_OBJ,
  DUSDC,
  CLOCK,
} from "./ids.js";
import {
  fetchActiveOracles,
  fetchReferencePrice,
  fetchSvi,
  pickCrashStrikeUsd,
  quoteDownPrice,
} from "./pricing.js";
import { decide, type Decision, type UnderwritingInput } from "./decide.js";
import { logToLocal, logToWalrus } from "./walrus.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, "..", "out");
const DECISIONS_JSON = join(OUT_DIR, "decisions.json");
const LOCAL_LOG = join(OUT_DIR, "decisions.jsonl");
// Also published into the web app so the UI can render live decisions (Vite serves /public at the site root).
const APP_PUBLIC_JSON = join(
  HERE,
  "..",
  "..",
  "app",
  "public",
  "agent-decisions.json",
);

// Underwrite at most this many soonest-expiry markets per cycle.
const MAX_MARKETS = 3;

type ExecutionResult =
  | {
      executed: true;
      digest: string;
      amountUsd: number;
      plpObjectId: string | null;
    }
  | { executed: false; reason: string };

type LoggedDecision = {
  input: UnderwritingInput;
  decision: Decision;
  execution: ExecutionResult;
  timestamp: string;
  walrusBlobId: string | null;
  walrusUrl: string | null;
};

// Execute an accept decision on-chain: supply DUSDC into the Predict vault
// (predict::supply, the underwriter side) so the agent backs the risk it priced.
// Gated behind AGENT_EXECUTE=1 + SUI_PRIVATE_KEY so the default path stays
// recommend-and-log (no funds, no key). Supply is sized to the agent's recommended
// capacity (AGENT_CAPACITY_BPS fraction of it), clamped to a per-call safety ceiling
// (AGENT_MAX_SUPPLY_USD) and the wallet balance. Never throws — failure → logged reason.
async function executeDecision(
  client: SuiClient,
  decision: Decision,
  _input: UnderwritingInput,
): Promise<ExecutionResult> {
  if (!decision.accept)
    return { executed: false, reason: "declined — no capital supplied" };
  const pk = process.env.SUI_PRIVATE_KEY;
  if (process.env.AGENT_EXECUTE !== "1" || !pk)
    return {
      executed: false,
      reason: "execution disabled (set AGENT_EXECUTE=1 + SUI_PRIVATE_KEY)",
    };

  try {
    const kp = Ed25519Keypair.fromSecretKey(pk.trim());
    const addr = kp.getPublicKey().toSuiAddress();
    const { data } = await client.getCoins({ owner: addr, coinType: DUSDC });
    if (!data.length)
      return { executed: false, reason: "no DUSDC in signer wallet" };

    const available = data.reduce((s, c) => s + BigInt(c.balance), 0n);
    // Size to the agent's recommended capacity. AGENT_CAPACITY_BPS is the fraction
    // of recommended capacity committed per call — testnet wallets are tiny vs the
    // notional capacity, so default to 1bps; with a funded production vault signer
    // raise it toward 10000 (100%). Clamp to a per-call ceiling and the balance.
    const bps = Number(process.env.AGENT_CAPACITY_BPS ?? "1");
    const capUsd = Number(process.env.AGENT_MAX_SUPPLY_USD ?? "25");
    const targetUsd = Math.min(
      (decision.maxCapacityUsd * bps) / 10_000,
      capUsd,
    );
    let amount = BigInt(Math.round(Math.max(targetUsd, 1) * Number(QTY_SCALE)));
    if (amount > available) amount = available;
    if (amount <= 0n)
      return { executed: false, reason: "no DUSDC in signer wallet" };
    const amountUsd = Number(amount) / Number(QTY_SCALE);

    const tx = new Transaction();
    const primary = tx.object(data[0].coinObjectId);
    if (data.length > 1)
      tx.mergeCoins(
        primary,
        data.slice(1).map((c) => tx.object(c.coinObjectId)),
      );
    const [coin] = tx.splitCoins(primary, [tx.pure.u64(amount)]);
    const plp = tx.moveCall({
      target: `${PREDICT_PKG}::predict::supply`,
      typeArguments: [DUSDC],
      arguments: [tx.object(PREDICT_OBJ), coin, tx.object(CLOCK)],
    });
    tx.transferObjects([plp], addr);

    const out = await client.signAndExecuteTransaction({
      signer: kp,
      transaction: tx,
      options: { showEffects: true, showObjectChanges: true },
    });
    if (out.effects?.status?.status !== "success")
      return {
        executed: false,
        reason: `tx aborted: ${out.effects?.status?.error ?? "unknown"}`,
      };
    const plpObj = (out.objectChanges ?? []).find(
      (c) => c.type === "created" && /PLP/.test(c.objectType),
    );
    return {
      executed: true,
      digest: out.digest,
      amountUsd,
      plpObjectId: plpObj && "objectId" in plpObj ? plpObj.objectId : null,
    };
  } catch (err) {
    return { executed: false, reason: (err as Error).message };
  }
}

async function runCycle(): Promise<void> {
  const client = new SuiClient({ url: getFullnodeUrl(NETWORK) });
  // Ephemeral sender — devInspect needs an address, not funds.
  const sender = Ed25519Keypair.generate().toSuiAddress();

  console.log(`[backstop] cycle @ ${new Date().toISOString()}`);
  console.log(`[backstop] devInspect sender ${sender}`);

  const [oracles, ref] = await Promise.all([
    fetchActiveOracles("BTC"),
    fetchReferencePrice("BTC"),
  ]);
  console.log(
    `[backstop] ${oracles.length} active BTC oracle(s); reference price ` +
      (ref ? `$${ref.priceUsd.toLocaleString()}` : "unavailable"),
  );
  if (!oracles.length) {
    console.log("[backstop] no active oracles — nothing to underwrite.");
    await persist([]);
    return;
  }

  const results: LoggedDecision[] = [];
  for (const o of oracles.slice(0, MAX_MARKETS)) {
    const strikeUsd = pickCrashStrikeUsd(ref?.priceUsd ?? null, o);
    console.log(
      `\n[market] oracle ${o.oracleId.slice(0, 10)}… expiry ${new Date(
        Number(o.expiryMs),
      ).toISOString()} strike $${strikeUsd.toLocaleString()}`,
    );

    let quote;
    try {
      quote = await quoteDownPrice(client, o, strikeUsd, sender);
    } catch (err) {
      console.warn(`  [skip] quote failed: ${(err as Error).message}`);
      continue;
    }
    const qtyRaw = quote.sizeUsd * QTY_SCALE;
    const premiumUsd = Number(quote.premiumRaw) / Number(QTY_SCALE);
    const bidUsd = Number(quote.bidRaw) / Number(QTY_SCALE);
    console.log(
      `  [quote] get_trade_amounts -> premium ${quote.premiumRaw} bid ${quote.bidRaw} (raw, qty ${qtyRaw}) ` +
        `=> implied crash prob ${(quote.impliedCrashProb * 100).toFixed(3)}%`,
    );

    const svi = await fetchSvi(o.oracleId);

    const input: UnderwritingInput = {
      symbol: o.symbol,
      oracleId: o.oracleId,
      expiryMs: o.expiryMs.toString(),
      strikeUsd: Number(strikeUsd),
      referencePriceUsd: ref?.priceUsd ?? null,
      impliedCrashProb: quote.impliedCrashProb,
      bidUsd,
      premiumUsd,
      sizeUsd: Number(quote.sizeUsd),
      svi,
    };

    const decision = await decide(input);
    console.log(
      `  [decision:${decision.source}] accept=${decision.accept} ` +
        `capacity=$${decision.maxCapacityUsd.toLocaleString()} premium=${decision.premiumBps}bps`,
    );
    console.log(`  [rationale] ${decision.rationale}`);

    const execution = await executeDecision(client, decision, input);
    if (execution.executed)
      console.log(
        `  [execute] supplied $${execution.amountUsd} → PLP ${execution.plpObjectId ?? "?"} · digest ${execution.digest}`,
      );
    else console.log(`  [execute] ${execution.reason}`);

    const record: LoggedDecision = {
      input,
      decision,
      execution,
      timestamp: new Date().toISOString(),
      walrusBlobId: null,
      walrusUrl: null,
    };

    const wal = await logToWalrus(
      record,
      Number(process.env.WALRUS_EPOCHS ?? 30),
    );
    if (wal.ok) {
      record.walrusBlobId = wal.blobId;
      record.walrusUrl = `${WALRUS_AGGREGATOR}/${wal.blobId}`;
      console.log(`  [walrus] logged blobId ${wal.blobId}`);
    } else {
      await logToLocal(LOCAL_LOG, record);
      console.log(
        `  [walrus] pending — unavailable (${wal.reason}); appended to ${LOCAL_LOG}`,
      );
    }

    results.push(record);
  }

  await persist(results);
  console.log(
    `\n[backstop] cycle done: ${results.length} decision(s) -> ${DECISIONS_JSON}`,
  );
}

async function persist(results: LoggedDecision[]): Promise<void> {
  const payload = JSON.stringify(
    { generatedAt: new Date().toISOString(), decisions: results },
    null,
    2,
  );
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(DECISIONS_JSON, payload, "utf8");
  // Expose to the web app UI (non-fatal if the app dir isn't present in a given deploy).
  try {
    await mkdir(dirname(APP_PUBLIC_JSON), { recursive: true });
    await writeFile(APP_PUBLIC_JSON, payload, "utf8");
  } catch {
    /* app/public not present — skip */
  }
}

async function main(): Promise<void> {
  const once = process.argv.includes("--once");
  if (once) {
    await runCycle();
    return;
  }
  const everyMs = 60_000;
  // Continuous self-driving loop.
  for (;;) {
    try {
      await runCycle();
    } catch (err) {
      console.error(`[backstop] cycle error: ${(err as Error).message}`);
    }
    console.log(`[backstop] sleeping ${everyMs / 1000}s…\n`);
    await new Promise((r) => setTimeout(r, everyMs));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
