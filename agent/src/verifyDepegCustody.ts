import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { normalizeSuiAddress } from "@mysten/sui/utils";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const DEP_ONLY_POLICY = 192;

type Deployment = {
  pythDepeg?: {
    deployer?: string;
    coverUpgradeCap?: string;
    lendingUpgradeCap?: string;
    productionPool?: {
      adminCap?: string;
    };
    stagedProof?: {
      adminCap?: string;
    };
  };
};

type ObjectOwner = { AddressOwner?: string };
type ObjectFields = Record<string, unknown>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const ok = (message: string) => console.log(`ok ${message}`);
const warn = (message: string) => console.log(`warn ${message}`);

function readDeployment(): Deployment {
  return JSON.parse(
    readFileSync(join(ROOT, "deployment.json"), "utf8"),
  ) as Deployment;
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

async function getObject(client: SuiClient, id: string) {
  const object = await client.getObject({
    id,
    options: { showContent: true, showOwner: true, showType: true },
  });
  assert(object.data, `object not found: ${id}`);
  return object.data;
}

async function verifyUpgradeCap(
  client: SuiClient,
  id: string,
  label: string,
): Promise<void> {
  const object = await getObject(client, id);
  assert(
    object.type === "0x2::package::UpgradeCap",
    `${label} has unexpected type ${object.type ?? "unknown"}`,
  );
  const fields = fieldsOf(object.content);
  const policy = Number(fields.policy);
  assert(
    policy === DEP_ONLY_POLICY,
    `${label} policy is ${Number.isFinite(policy) ? policy : "unknown"}, expected ${DEP_ONLY_POLICY}`,
  );
  ok(`${label} policy DEP_ONLY`);
}

async function verifyAdminCap(
  client: SuiClient,
  id: string,
  label: string,
  expectedOwner: string | null,
  deployer: string | null,
): Promise<void> {
  const object = await getObject(client, id);
  assert(
    object.type?.endsWith("::pyth_cover_pool::AdminCap"),
    `${label} has unexpected type ${object.type ?? "unknown"}`,
  );
  const owner = ownerAddress(object.owner);
  assert(owner, `${label} owner not found`);

  if (expectedOwner) {
    assert(
      owner === expectedOwner,
      `${label} owner ${owner} does not match expected ${expectedOwner}`,
    );
    ok(`${label} owner ${owner}`);
    return;
  }

  if (deployer && owner === deployer) {
    warn(`${label} still owned by deployer ${owner}`);
    return;
  }

  ok(`${label} owner ${owner}`);
}

async function main(): Promise<void> {
  const deployment = readDeployment();
  const pyth = deployment.pythDepeg;
  assert(pyth, "deployment.json missing pythDepeg");
  assert(pyth.coverUpgradeCap, "deployment.json missing coverUpgradeCap");
  assert(pyth.lendingUpgradeCap, "deployment.json missing lendingUpgradeCap");
  assert(
    pyth.productionPool?.adminCap,
    "deployment.json missing production adminCap",
  );
  assert(pyth.stagedProof?.adminCap, "deployment.json missing staged adminCap");

  const expectedOwner = process.env.EXPECTED_ADMIN_OWNER?.trim()
    ? normalizeSuiAddress(process.env.EXPECTED_ADMIN_OWNER)
    : null;
  const deployer = pyth.deployer ? normalizeSuiAddress(pyth.deployer) : null;
  const client = new SuiClient({ url: getFullnodeUrl("mainnet") });

  await verifyUpgradeCap(client, pyth.coverUpgradeCap, "cover UpgradeCap");
  await verifyUpgradeCap(client, pyth.lendingUpgradeCap, "lending UpgradeCap");
  await verifyAdminCap(
    client,
    pyth.productionPool.adminCap,
    "production AdminCap",
    expectedOwner,
    deployer,
  );
  await verifyAdminCap(
    client,
    pyth.stagedProof.adminCap,
    "staged AdminCap",
    expectedOwner,
    deployer,
  );

  if (!expectedOwner) {
    warn(
      "set EXPECTED_ADMIN_OWNER=0x... after multisig transfer to make AdminCap ownership a hard check",
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
