// Backstop public-readiness check. Verifies the judge-facing surface is intact:
//   live site, on-chain RiskFeed object, key tx digests, and — critically —
//   that the on-chain readings' Walrus proof blobs are still retrievable.
// Run: node scripts/verify-public.mjs   (or: npm run verify:public)
// Exits non-zero if anything fails.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const RPC = "https://fullnode.testnet.sui.io:443";
const AGG = "https://aggregator.walrus-testnet.walrus.space/v1/blobs";
const SITE = "https://backstop.gudman.xyz";

let pass = 0;
let fail = 0;
const ok = (m) => (pass++, console.log(`  ok   ${m}`));
const bad = (m) => (fail++, console.log(`  FAIL ${m}`));

async function rpc(method, params) {
  const r = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return (await r.json()).result;
}

async function head(url) {
  try {
    return (await fetch(url, { method: "HEAD" })).status;
  } catch {
    return 0;
  }
}

async function txOk(digest, label) {
  if (!digest) return bad(`${label}: missing digest`);
  try {
    const r = await rpc("sui_getTransactionBlock", [
      digest,
      { showEffects: true },
    ]);
    const s = r?.effects?.status?.status;
    s === "success"
      ? ok(`${label} tx ${digest.slice(0, 8)}… success`)
      : bad(`${label} tx ${digest}: status ${s ?? "not found"}`);
  } catch (e) {
    bad(`${label} tx ${digest}: ${e.message}`);
  }
}

async function main() {
  const d = JSON.parse(await readFile(join(ROOT, "deployment.json"), "utf8"));

  console.log("\n[1] live site");
  const site = await head(SITE);
  site === 200 ? ok(`site ${site}`) : bad(`site ${site}`);
  const fav = await head(`${SITE}/favicon.svg`);
  fav === 200 ? ok(`favicon ${fav}`) : bad(`favicon ${fav}`);

  console.log("\n[2] on-chain RiskFeed object");
  const feed = await rpc("sui_getObject", [
    d.riskFeed.feedObject,
    { showType: true },
  ]);
  feed?.data?.objectId
    ? ok(`RiskFeed object ${feed.data.objectId.slice(0, 8)}…`)
    : bad("RiskFeed object not found");

  console.log("\n[3] key tx digests");
  await txOk(d.livePolicyMint?.digest, "policy mint");
  await txOk(d.riskFeed?.publishDigest, "RiskFeed publish");
  await txOk(d.riskFeed?.readingsPublishedDigest, "RiskFeed readings");
  await txOk(d.riskGuard?.publishDigest, "risk_guard publish");
  await txOk(d.riskGuard?.withdrawDigest, "risk_guard withdraw");
  for (const s of d.agentSupply?.supplies ?? [])
    await txOk(s.digest, `agent supply $${s.amountUsd}`);

  console.log("\n[4] latest on-chain readings — Walrus proof availability");
  const ev = await rpc("suix_queryEvents", [
    { MoveEventType: `${d.riskFeed.package}::risk_feed::ReadingPublished` },
    null,
    25,
    true, // descending
  ]);
  const seen = new Set();
  const latest = (ev?.data ?? [])
    .map((e) => e.parsedJson)
    // Only the agent's BTC-oracle readings (key "BTC<strike@expiry") form the
    // Walrus-proven calibration ledger; cover-pool markets (e.g. "BTC-CRASH-30D")
    // are operational oracle inputs, not part of this proof set.
    .filter((r) => r.market.includes("<") && r.market.includes("@"))
    .filter((r) => (seen.has(r.market) ? false : (seen.add(r.market), true)));
  const maxTs = latest.reduce((m, r) => Math.max(m, Number(r.ts_ms)), 0);
  const recent = latest.filter((r) => Number(r.ts_ms) >= maxTs - 6 * 3600_000);
  if (!recent.length) bad("no recent on-chain readings");
  for (const r of recent) {
    const code = await head(`${AGG}/${r.walrus_blob}`);
    code === 200
      ? ok(`proof live: ${r.market} (${(r.prob_bps / 100).toFixed(2)}%)`)
      : bad(`proof ${code}: ${r.market} blob ${r.walrus_blob}`);
  }

  console.log("\n[5] app agent-decisions.json");
  try {
    const aj = JSON.parse(
      await readFile(join(ROOT, "app", "public", "agent-decisions.json"), "utf8"),
    );
    const execs = aj.decisions.filter((x) => x.execution?.executed);
    execs.length
      ? ok(`${execs.length} executed supply row(s), $${execs.reduce((s, x) => s + x.execution.amountUsd, 0).toFixed(2)} total`)
      : bad("no executed supply rows (AI tab would show $0.00)");
    for (const x of aj.decisions) {
      if (!x.walrusBlobId) continue;
      const code = await head(`${AGG}/${x.walrusBlobId}`);
      code === 200
        ? ok(`decision proof live: ${x.walrusBlobId.slice(0, 10)}…`)
        : bad(`decision proof ${code}: ${x.walrusBlobId}`);
    }
  } catch (e) {
    bad(`agent-decisions.json: ${e.message}`);
  }

  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
