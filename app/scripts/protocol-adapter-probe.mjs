import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";

const protocol = process.env.BACKSTOP_ADAPTER_PROTOCOL ?? "Suilend";
const objectId = process.env.BACKSTOP_ADAPTER_OBJECT_ID;

if (!objectId) {
  console.error("BACKSTOP_ADAPTER_OBJECT_ID is required");
  process.exit(1);
}

function flattenFields(prefix, value, rows) {
  if (value === null || value === undefined) return;
  if (typeof value !== "object") {
    rows.push({ field: prefix, value: String(value) });
    return;
  }
  if (Array.isArray(value)) {
    rows.push({ field: prefix, value: `[array:${value.length}]` });
    value.forEach((child, index) => {
      flattenFields(`${prefix}[${index}]`, child, rows);
    });
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    flattenFields(prefix ? `${prefix}.${key}` : key, child, rows);
  }
}

function classifyField(field) {
  const lower = field.toLowerCase();
  if (lower.includes("obligation")) return "obligation";
  if (lower.includes("reserve")) return "reserve";
  if (lower.includes("borrow")) return "borrow";
  if (lower.includes("deposit") || lower.includes("collateral"))
    return "collateral";
  if (lower.includes("balance") || lower.includes("amount")) return "balance";
  if (lower.includes("oracle") || lower.includes("price")) return "oracle";
  return "metadata";
}

async function main() {
  const client = new SuiClient({
    url: process.env.SUI_FULLNODE_URL ?? getFullnodeUrl("mainnet"),
  });
  const response = await client.getObject({
    id: objectId,
    options: { showContent: true, showOwner: true, showType: true },
  });

  const content = response.data?.content;
  const rows = [];
  if (content?.dataType === "moveObject") {
    flattenFields("", content.fields, rows);
  }

  const report = {
    protocol,
    objectId,
    exists: Boolean(response.data),
    type: response.data?.type ?? null,
    owner: response.data?.owner ?? null,
    normalizedCandidates: rows.map((row) => ({
      ...row,
      role: classifyField(row.field),
    })),
    adapterBoundary:
      "Probe output is evidence discovery. Production cover requires a partner-approved parser and consent/governance path.",
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
