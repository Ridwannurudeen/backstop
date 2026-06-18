import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import { suiRpcUrl } from "./rpc.js";
import { loadSuiKeypair } from "./suiSigner.js";

const DEP_ONLY_POLICY = 192;

type ObjectOwner = { AddressOwner?: string };
type ObjectFields = Record<string, unknown>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function fieldsOf(content: unknown): ObjectFields {
  if (!content || typeof content !== "object") return {};
  const fields = (content as { fields?: unknown }).fields;
  return fields && typeof fields === "object"
    ? (fields as ObjectFields)
    : (content as ObjectFields);
}

function ownerAddress(owner: unknown): string | null {
  if (!owner || typeof owner !== "object") return null;
  const address = (owner as ObjectOwner).AddressOwner;
  return typeof address === "string" ? normalizeSuiAddress(address) : null;
}

function upgradeCaps(): string[] {
  const raw = process.env.UPGRADE_CAPS?.trim();
  assert(raw, "Set UPGRADE_CAPS to a comma-separated list of UpgradeCap IDs");
  const caps = raw
    .split(",")
    .map((cap) => cap.trim())
    .filter(Boolean);
  assert(caps.length > 0, "UPGRADE_CAPS did not contain any object IDs");
  return caps;
}

async function assertOwnedUpgradeCap(
  client: SuiClient,
  id: string,
  owner: string,
): Promise<void> {
  const object = await client.getObject({
    id,
    options: { showContent: true, showOwner: true, showType: true },
  });
  assert(object.data, `UpgradeCap not found: ${id}`);
  assert(
    object.data.type === "0x2::package::UpgradeCap",
    `${id} has unexpected type ${object.data.type ?? "unknown"}`,
  );
  const actualOwner = ownerAddress(object.data.owner);
  assert(actualOwner, `${id} owner not found`);
  assert(
    actualOwner === owner,
    `${id} owner ${actualOwner} is not signer ${owner}`,
  );
}

async function verifyPolicy(client: SuiClient, id: string): Promise<void> {
  const object = await client.getObject({
    id,
    options: { showContent: true, showType: true },
  });
  assert(object.data, `UpgradeCap not found after lock: ${id}`);
  const policy = Number(fieldsOf(object.data.content).policy);
  assert(
    policy === DEP_ONLY_POLICY,
    `${id} policy is ${Number.isFinite(policy) ? policy : "unknown"}, expected ${DEP_ONLY_POLICY}`,
  );
  console.log(`locked: ${id}`);
}

function buildLockTx(caps: string[]): Transaction {
  const tx = new Transaction();
  for (const cap of caps) {
    tx.moveCall({
      target: "0x2::package::only_dep_upgrades",
      arguments: [tx.object(cap)],
    });
  }
  return tx;
}

async function main(): Promise<void> {
  const caps = upgradeCaps();
  const client = new SuiClient({ url: suiRpcUrl("mainnet") });
  const kp = loadSuiKeypair();
  const sender = kp.getPublicKey().toSuiAddress();

  for (const cap of caps) {
    await assertOwnedUpgradeCap(client, cap, sender);
  }

  const tx = buildLockTx(caps);
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
    console.log(`objects: ${caps.join(", ")}`);
    console.log("rerun with --execute to lock upgrade policy");
    return;
  }

  const out = await client.signAndExecuteTransaction({
    signer: kp,
    transaction: tx,
    options: { showEffects: true },
  });
  const status = out.effects?.status.status;
  console.log(`lock: ${status} · ${out.digest}`);
  if (status !== "success") {
    throw new Error(out.effects?.status.error ?? "lock failed");
  }
  await client.waitForTransaction({ digest: out.digest });
  for (const cap of caps) {
    await verifyPolicy(client, cap);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
