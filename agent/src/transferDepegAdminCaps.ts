import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import { loadSuiKeypair } from "./suiSigner.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");

type Deployment = {
  pythDepeg?: {
    productionPool?: {
      adminCap?: string;
    };
    stagedProof?: {
      adminCap?: string;
    };
  };
};

type AddressOwner = {
  AddressOwner?: string;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function readDeployment(): Deployment {
  return JSON.parse(
    readFileSync(join(ROOT, "deployment.json"), "utf8"),
  ) as Deployment;
}

function ownerAddress(owner: unknown): string | null {
  if (!owner || typeof owner !== "object") return null;
  const address = (owner as AddressOwner).AddressOwner;
  return typeof address === "string" ? normalizeSuiAddress(address) : null;
}

async function assertOwnedBy(
  client: SuiClient,
  objectId: string,
  owner: string,
  label: string,
): Promise<void> {
  const object = await client.getObject({
    id: objectId,
    options: { showOwner: true, showType: true },
  });
  assert(object.data, `${label} not found: ${objectId}`);
  assert(
    object.data.type?.endsWith("::pyth_cover_pool::AdminCap"),
    `${label} has unexpected type ${object.data.type ?? "unknown"}`,
  );
  const actual = ownerAddress(object.data.owner);
  assert(actual, `${label} owner not found`);
  assert(actual === owner, `${label} owner ${actual} is not signer ${owner}`);
}

function buildTransferTx(adminCaps: string[], recipient: string): Transaction {
  const tx = new Transaction();
  tx.transferObjects(
    adminCaps.map((id) => tx.object(id)),
    recipient,
  );
  return tx;
}

async function main(): Promise<void> {
  const recipientRaw = process.env.ADMIN_CAP_RECIPIENT?.trim();
  assert(recipientRaw, "Set ADMIN_CAP_RECIPIENT to the real multisig address");
  const recipient = normalizeSuiAddress(recipientRaw);
  const deployment = readDeployment();
  const productionAdminCap = deployment.pythDepeg?.productionPool?.adminCap;
  const stagedAdminCap = deployment.pythDepeg?.stagedProof?.adminCap;
  assert(productionAdminCap, "deployment.json missing production adminCap");
  assert(stagedAdminCap, "deployment.json missing staged adminCap");

  const kp = loadSuiKeypair();
  const sender = kp.getPublicKey().toSuiAddress();
  const client = new SuiClient({ url: getFullnodeUrl("mainnet") });
  const adminCaps = [productionAdminCap, stagedAdminCap];

  await assertOwnedBy(
    client,
    productionAdminCap,
    sender,
    "production AdminCap",
  );
  await assertOwnedBy(client, stagedAdminCap, sender, "staged AdminCap");

  const tx = buildTransferTx(adminCaps, recipient);
  tx.setSender(sender);

  if (!process.argv.includes("--execute")) {
    const bytes = await tx.build({ client });
    const dryRun = await client.dryRunTransactionBlock({
      transactionBlock: bytes,
    });
    const status = dryRun.effects.status.status;
    console.log(`dry-run: ${status}`);
    if (status !== "success") {
      throw new Error(dryRun.effects.status.error ?? "dry-run failed");
    }
    console.log(`sender: ${sender}`);
    console.log(`recipient: ${recipient}`);
    console.log(`objects: ${adminCaps.join(", ")}`);
    console.log("rerun with --execute to transfer both AdminCaps");
    return;
  }

  const out = await client.signAndExecuteTransaction({
    signer: kp,
    transaction: tx,
    options: { showEffects: true, showObjectChanges: true },
  });
  const status = out.effects?.status.status;
  console.log(`transfer: ${status} · ${out.digest}`);
  if (status !== "success") {
    throw new Error(out.effects?.status.error ?? "transfer failed");
  }
  await client.waitForTransaction({ digest: out.digest });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
