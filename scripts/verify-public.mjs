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
const RPC = "https://public-rpc.testnet.sui.io:443";
const MAINNET_RPC = "https://public-rpc.mainnet.sui.io:443";
const AGG = "https://aggregator.walrus-testnet.walrus.space/v1/blobs";
const SITE = "https://backstop.gudman.xyz";

let pass = 0;
let fail = 0;
const ok = (m) => (pass++, console.log(`  ok   ${m}`));
const bad = (m) => (fail++, console.log(`  FAIL ${m}`));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchRetry(url, init) {
  let last;
  for (let i = 0; i < 5; i++) {
    try {
      return await fetch(url, init);
    } catch (e) {
      last = e;
      await sleep(1_000 * (i + 1));
    }
  }
  throw last;
}

async function rpc(method, params, url = RPC) {
  const r = await fetchRetry(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return (await r.json()).result;
}

async function head(url) {
  let code = 0;
  for (let i = 0; i < 5; i++) {
    try {
      code = (await fetch(url, { method: "HEAD" })).status;
      if (code === 200) return code;
    } catch {
      code = 0;
    }
    await sleep(1_000 * (i + 1));
  }
  return code;
}

async function txOk(digest, label, url = RPC) {
  if (!digest) return bad(`${label}: missing digest`);
  try {
    const r = await rpc(
      "sui_getTransactionBlock",
      [digest, { showEffects: true }],
      url,
    );
    const s = r?.effects?.status?.status;
    s === "success"
      ? ok(`${label} tx ${digest.slice(0, 8)}… success`)
      : bad(`${label} tx ${digest}: status ${s ?? "not found"}`);
  } catch (e) {
    bad(`${label} tx ${digest}: ${e.message}`);
  }
}

async function upgradeCapDepOnly(id, label) {
  if (!id) return bad(`${label}: missing object id`);
  try {
    const r = await rpc(
      "sui_getObject",
      [id, { showContent: true, showType: true }],
      MAINNET_RPC,
    );
    const policy = Number(r?.data?.content?.fields?.policy);
    policy === 192
      ? ok(`${label} policy DEP_ONLY`)
      : bad(
          `${label} policy ${Number.isFinite(policy) ? policy : "not found"}`,
        );
  } catch (e) {
    bad(`${label}: ${e.message}`);
  }
}

async function adminCapOwnedBy(id, expectedOwner, label) {
  if (!id) return bad(`${label}: missing object id`);
  if (!expectedOwner) return bad(`${label}: missing expected owner`);
  try {
    const r = await rpc(
      "sui_getObject",
      [id, { showOwner: true, showType: true }],
      MAINNET_RPC,
    );
    const owner = r?.data?.owner?.AddressOwner?.toLowerCase();
    owner === expectedOwner.toLowerCase()
      ? ok(`${label} owner ${owner.slice(0, 8)}…`)
      : bad(`${label} owner ${owner ?? "not found"}`);
  } catch (e) {
    bad(`${label}: ${e.message}`);
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
      await readFile(
        join(ROOT, "app", "public", "agent-decisions.json"),
        "utf8",
      ),
    );
    const execs = aj.decisions.filter((x) => x.execution?.executed);
    execs.length
      ? ok(
          `${execs.length} executed supply row(s), $${execs.reduce((s, x) => s + x.execution.amountUsd, 0).toFixed(2)} total`,
        )
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

  console.log(
    "\n[6] widen-scope primitives (accountability / registry / lending)",
  );
  for (const [obj, label] of [
    [d.accountability?.calibrationLedger, "CalibrationLedger object"],
    [d.poolRegistry?.registry, "PoolRegistry object"],
    [d.lendingDemo?.lendingMarket, "LendingMarket object"],
  ]) {
    const o = obj
      ? await rpc("sui_getObject", [obj, { showType: true }])
      : null;
    o?.data?.objectId
      ? ok(`${label} ${o.data.objectId.slice(0, 8)}…`)
      : bad(`${label} not found`);
  }
  await txOk(d.accountability?.proof?.registerDigest, "passport register");
  await txOk(d.accountability?.proof?.settleDigest, "calibration settle");
  await txOk(d.poolRegistry?.registerDigest, "pool registry register");
  await txOk(
    d.lendingDemo?.proof?.coverShortfallDigest,
    "lending cover_shortfall",
  );

  console.log("\n[7] SRX index + trustless settlement");
  const ri = d.riskIndex?.riskIndex
    ? await rpc("sui_getObject", [d.riskIndex.riskIndex, { showType: true }])
    : null;
  ri?.data?.objectId
    ? ok(`RiskIndex object ${ri.data.objectId.slice(0, 8)}…`)
    : bad("RiskIndex object not found");
  await txOk(d.riskIndex?.live?.publishDigest, "SRX publish");
  if (d.riskIndex?.live?.cdfWalrusBlob) {
    const code = await head(`${AGG}/${d.riskIndex.live.cdfWalrusBlob}`);
    code === 200
      ? ok("SRX cdf evidence live on Walrus")
      : bad(`SRX cdf blob ${code}`);
  }
  await txOk(
    d.oraclePool?.liveClaimProof?.claimDigest,
    "trustless claim (reads DeepBook oracle)",
  );
  const ar = d.arena?.arena
    ? await rpc("sui_getObject", [d.arena.arena, { showType: true }])
    : null;
  ar?.data?.objectId
    ? ok(`Arena object ${ar.data.objectId.slice(0, 8)}…`)
    : bad("Arena object not found");
  await txOk(d.arena?.liveProof?.slashDigest, "proof-of-judgment slash");

  console.log("\n[8] mainnet Pyth depeg deployment");
  for (const [obj, label] of [
    [d.pythDepeg?.coverPackage, "pyth_cover_pool package"],
    [d.pythDepeg?.productionPool?.pool, "production DepegCoverPool object"],
    [d.pythDepeg?.stagedProof?.pool, "staged DepegCoverPool object"],
    [d.pythDepeg?.lendingPackage, "pyth_lending_demo package"],
    [
      d.pythDepeg?.productionPool?.lendingMarket,
      "production Pyth LendingMarket object",
    ],
    [
      d.pythDepeg?.stagedProof?.lendingMarket,
      "staged Pyth LendingMarket object",
    ],
  ]) {
    let o = null;
    try {
      o = obj
        ? await rpc("sui_getObject", [obj, { showType: true }], MAINNET_RPC)
        : null;
    } catch (e) {
      bad(`${label}: ${e.message}`);
      continue;
    }
    o?.data?.objectId
      ? ok(`${label} ${o.data.objectId.slice(0, 8)}â€¦`)
      : bad(`${label} not found`);
  }
  await txOk(
    d.pythDepeg?.coverPublishDigest,
    "pyth cover publish",
    MAINNET_RPC,
  );
  await txOk(
    d.pythDepeg?.lendingPublishDigest,
    "pyth lending publish",
    MAINNET_RPC,
  );
  await upgradeCapDepOnly(
    d.pythDepeg?.coverUpgradeCap,
    "pyth cover UpgradeCap",
  );
  await upgradeCapDepOnly(
    d.pythDepeg?.lendingUpgradeCap,
    "pyth lending UpgradeCap",
  );
  await txOk(
    d.pythDepeg?.coverUpgradePolicyLockDigest,
    "pyth cover upgrade policy lock",
    MAINNET_RPC,
  );
  await txOk(
    d.pythDepeg?.lendingUpgradePolicyLockDigest,
    "pyth lending upgrade policy lock",
    MAINNET_RPC,
  );
  await txOk(
    d.pythDepeg?.adminCustody?.transferDigest,
    "pyth AdminCap custody transfer",
    MAINNET_RPC,
  );
  await adminCapOwnedBy(
    d.pythDepeg?.productionPool?.adminCap,
    d.pythDepeg?.adminCustody?.owner,
    "production AdminCap",
  );
  await adminCapOwnedBy(
    d.pythDepeg?.stagedProof?.adminCap,
    d.pythDepeg?.adminCustody?.owner,
    "staged AdminCap",
  );
  await txOk(
    d.pythDepeg?.productionPool?.insureDigest,
    "pyth production adapter insure",
    MAINNET_RPC,
  );
  await txOk(
    d.pythDepeg?.stagedProof?.insureDigest,
    "pyth depeg insure",
    MAINNET_RPC,
  );
  await txOk(
    d.pythDepeg?.stagedProof?.recordArmDigest,
    "pyth depeg arm",
    MAINNET_RPC,
  );
  await txOk(
    d.pythDepeg?.stagedProof?.recordConfirmDigest,
    "pyth depeg confirm",
    MAINNET_RPC,
  );
  await txOk(
    d.pythDepeg?.stagedProof?.claimDigest,
    "pyth depeg claim",
    MAINNET_RPC,
  );

  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
