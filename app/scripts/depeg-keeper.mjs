import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Secp256k1Keypair } from "@mysten/sui/keypairs/secp256k1";
import { Secp256r1Keypair } from "@mysten/sui/keypairs/secp256r1";
import {
  buildDepegClaimLatchedTx,
  buildDepegExpirePolicyByIdTx,
  buildDepegRecordBreachTx,
  readDepegPool,
  readDepegPrice,
} from "@gudman/backstop-sdk";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const CONFIG = {
  packageId:
    process.env.BACKSTOP_DEPEG_PACKAGE ??
    "0x761832702281966fac9dee6183b530d2f73ecd779524c61cd3dd4705fa6ec968",
  poolId:
    process.env.BACKSTOP_DEPEG_POOL ??
    "0x5edc508a4258e1253563219049dadc8b068cf309115e29732dad71698c168592",
  priceObjectId:
    process.env.BACKSTOP_DEPEG_PRICE_OBJECT ??
    "0x9b2028bfc829127d2e5ead1691dc3002de9e9b8d8076b4915e5ecc7d9b99d63f",
  defaultPolicyId:
    "0x3863ad1bf44904af1fcc3ead38589977378e6800e14ceacebf1205187ce695ec",
  thresholdUsd: Number(process.env.BACKSTOP_DEPEG_THRESHOLD_USD ?? "0.985"),
};

const MIST_PER_SUI = 1_000_000_000;

function policyIds() {
  return (process.env.BACKSTOP_DEPEG_POLICY_IDS ?? CONFIG.defaultPolicyId)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function fieldValue(fields, names) {
  if (!fields) return null;
  for (const name of names) {
    const value = fields[name];
    if (value !== undefined && value !== null) return String(value);
  }
  return null;
}

function numberField(value) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function boolField(value) {
  return value === "true" || value === "1";
}

function moveFields(object) {
  return object?.content?.dataType === "moveObject"
    ? object.content.fields
    : null;
}

async function fetchObject(client, objectId) {
  const response = await client.getObject({
    id: objectId,
    options: { showContent: true, showOwner: true, showType: true },
  });
  return response.data ?? null;
}

function keypairFromEnv() {
  const secret = process.env.SUI_PRIVATE_KEY;
  if (!secret) {
    throw new Error(
      "SUI_PRIVATE_KEY is required when BACKSTOP_DEPEG_KEEPER_EXECUTE=1",
    );
  }

  const parsed = decodeSuiPrivateKey(secret);
  if (parsed.scheme === "ED25519")
    return Ed25519Keypair.fromSecretKey(parsed.secretKey);
  if (parsed.scheme === "Secp256k1")
    return Secp256k1Keypair.fromSecretKey(parsed.secretKey);
  if (parsed.scheme === "Secp256r1")
    return Secp256r1Keypair.fromSecretKey(parsed.secretKey);
  throw new Error(`Unsupported Sui key scheme: ${parsed.scheme}`);
}

function derivePolicyAction(policy, price) {
  const fields = moveFields(policy.object);
  const expiryMs = numberField(
    fieldValue(fields, ["expiry_ms", "expiry", "expires_at_ms"]),
  );
  const latched = boolField(
    fieldValue(fields, [
      "latched",
      "claim_latched",
      "claimable",
      "settled",
      "paid",
    ]),
  );
  const breachObservedAt = fieldValue(fields, [
    "breach_observed_at_ms",
    "breach_started_at_ms",
    "armed_at_ms",
    "armed_since_ms",
    "armed_at",
  ]);
  const coverMist = fieldValue(fields, ["cover", "cover_mist", "cover_amount"]);
  const expired = expiryMs !== null && Date.now() > expiryMs;

  if (latched) {
    return {
      action: "claim-latched",
      executable: true,
      reason: "policy exposes a latched/claimable field",
      builder: "buildDepegClaimLatchedTx",
      coverMist,
      expiryMs,
      breachObservedAt,
    };
  }

  if (expired) {
    return {
      action: "expire-policy",
      executable: true,
      reason: "policy expiry is in the past and no latch field is asserted",
      builder: "buildDepegExpirePolicyByIdTx",
      coverMist,
      expiryMs,
      breachObservedAt,
    };
  }

  if (price.triggered) {
    return {
      action: breachObservedAt ? "confirm-breach" : "record-breach",
      executable: true,
      reason: breachObservedAt
        ? "price is below threshold and policy has prior breach observation"
        : "price is below threshold and policy has no observed breach timestamp",
      builder: "buildDepegRecordBreachTx",
      coverMist,
      expiryMs,
      breachObservedAt,
    };
  }

  return {
    action: "observe",
    executable: false,
    reason: "price is above threshold and policy is not expired or latched",
    builder: null,
    coverMist,
    expiryMs,
    breachObservedAt,
  };
}

async function buildTransaction(client, action, policyId, owner) {
  if (action.action === "claim-latched") {
    return buildDepegClaimLatchedTx({
      pkg: CONFIG.packageId,
      poolId: CONFIG.poolId,
      policyId,
      owner,
    });
  }

  if (action.action === "expire-policy") {
    return buildDepegExpirePolicyByIdTx({
      pkg: CONFIG.packageId,
      poolId: CONFIG.poolId,
      policyId,
    });
  }

  if (action.action === "record-breach" || action.action === "confirm-breach") {
    return buildDepegRecordBreachTx({
      client,
      pkg: CONFIG.packageId,
      poolId: CONFIG.poolId,
      policyId,
    });
  }

  return null;
}

async function executeAction(client, keypair, policyId, action) {
  const owner =
    process.env.BACKSTOP_DEPEG_POLICY_OWNER ?? keypair.toSuiAddress();
  const transaction = await buildTransaction(client, action, policyId, owner);
  if (!transaction) return null;

  const result = await client.signAndExecuteTransaction({
    transaction,
    signer: keypair,
    options: { showEffects: true, showObjectChanges: true },
  });
  await client.waitForTransaction({ digest: result.digest });
  return {
    digest: result.digest,
    status: result.effects?.status?.status ?? "unknown",
  };
}

async function main() {
  const client = new SuiClient({
    url: process.env.SUI_FULLNODE_URL ?? getFullnodeUrl("mainnet"),
  });
  const execute = process.env.BACKSTOP_DEPEG_KEEPER_EXECUTE === "1";
  const keypair = execute ? keypairFromEnv() : null;
  const [pool, price, ...objects] = await Promise.all([
    readDepegPool(client, CONFIG.poolId),
    readDepegPrice(client, {
      priceObject: CONFIG.priceObjectId,
      thresholdUsd: CONFIG.thresholdUsd,
    }),
    ...policyIds().map((id) => fetchObject(client, id)),
  ]);
  const ids = policyIds();

  const report = {
    ts: new Date().toISOString(),
    mode: execute ? "execute" : "dry-run",
    packageId: CONFIG.packageId,
    poolId: CONFIG.poolId,
    price: {
      priceUsd: price.priceUsd,
      adversePriceUsd: price.adversePriceUsd,
      thresholdUsd: CONFIG.thresholdUsd,
      triggered: price.triggered,
      publishMs: price.publishMs,
    },
    pool: {
      fundsSui: Number(pool.fundsMist) / MIST_PER_SUI,
      totalCoverSui: Number(pool.totalCoverMist) / MIST_PER_SUI,
      keeperBountySui: Number(pool.keeperBountyMist) / MIST_PER_SUI,
      paused: pool.paused,
    },
    policies: [],
  };

  for (let index = 0; index < ids.length; index += 1) {
    const object = objects[index];
    const action = derivePolicyAction({ object }, price);
    const policyReport = {
      policyId: ids[index],
      type: object?.type ?? null,
      exists: Boolean(object),
      ...action,
      execution: null,
    };

    if (execute && action.executable) {
      policyReport.execution = await executeAction(
        client,
        keypair,
        ids[index],
        action,
      );
    }

    report.policies.push(policyReport);
  }

  const output = JSON.stringify(report, null, 2);
  console.log(output);

  const outputPath =
    process.env.BACKSTOP_DEPEG_KEEPER_OUT ??
    fileURLToPath(new URL("../public/api/keeper-operations.json", import.meta.url));
  if (outputPath) {
    await mkdir(dirname(outputPath), {
      recursive: true,
    });
    await writeFile(outputPath, `${output}\n`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
