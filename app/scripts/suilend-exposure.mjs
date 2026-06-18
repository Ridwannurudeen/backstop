import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";

const DEFAULT_OBLIGATION_ID =
  "0xffff7cfccd5049bc6f5adb20a770a822f920a3f78690213b08c231884763bf6a";
const DEFAULT_OWNER_CAP_ID =
  "0x16ee69982511332c08dc697c878c3d943e52d6be8c303ec27807a406207d6122";

const obligationId = process.env.SUILEND_OBLIGATION_ID ?? DEFAULT_OBLIGATION_ID;
const ownerCapId =
  process.env.SUILEND_OBLIGATION_OWNER_CAP_ID ?? DEFAULT_OWNER_CAP_ID;
const txDigest =
  process.env.SUILEND_SAMPLE_TX ??
  "2PBCaEbBHiFLU7fDwU4zihUq4CQtKArbXXC9JygTL169";

function decimal(value) {
  const raw = value?.fields?.value ?? value?.value ?? value;
  if (raw === null || raw === undefined) return 0;
  return Number(raw) / 1e18;
}

function typeName(value) {
  return value?.fields?.name ?? String(value ?? "");
}

function normalizeCoinType(name) {
  if (
    name.startsWith(
      "0000000000000000000000000000000000000000000000000000000000000002::",
    )
  ) {
    return `0x2::${name.split("::").slice(1).join("::")}`;
  }
  return name.startsWith("0x") ? name : `0x${name}`;
}

function fieldsOf(object) {
  const content = object?.content;
  if (content?.dataType !== "moveObject") {
    throw new Error(`Object ${obligationId} is not a Move object`);
  }
  return content.fields;
}

function exposureFromFields(fields, object) {
  const deposits = (fields.deposits ?? []).map((deposit) => {
    const item = deposit.fields;
    return {
      assetType: normalizeCoinType(typeName(item.coin_type)),
      reserveArrayIndex: Number(item.reserve_array_index),
      cTokenAmount: item.deposited_ctoken_amount,
      marketValueUsd: decimal(item.market_value),
      attributedBorrowValueUsd: decimal(item.attributed_borrow_value),
    };
  });

  const borrows = (fields.borrows ?? []).map((borrow) => {
    const item = borrow.fields;
    return {
      reserveArrayIndex: Number(item.reserve_array_index),
      borrowedAmount: item.borrowed_amount ?? null,
      marketValueUsd: decimal(item.market_value),
    };
  });

  const depositedValueUsd = decimal(fields.deposited_value_usd);
  const borrowedValueUsd = decimal(fields.weighted_borrowed_value_usd);
  const allowedBorrowUsd = decimal(fields.allowed_borrow_value_usd);
  const unhealthyBorrowUsd = decimal(fields.unhealthy_borrow_value_usd);
  const utilizationBps =
    allowedBorrowUsd > 0
      ? Math.round((borrowedValueUsd / allowedBorrowUsd) * 10_000)
      : 0;
  const healthBufferUsd = Math.max(0, unhealthyBorrowUsd - borrowedValueUsd);

  return {
    protocol: "Suilend",
    source: "sui-mainnet-object",
    objectId: obligationId,
    ownerCapId,
    sampleTxDigest: txDigest,
    type: object.type,
    lendingMarketId: fields.lending_market_id,
    depositedValueUsd,
    borrowedValueUsd,
    allowedBorrowUsd,
    unhealthyBorrowUsd,
    healthBufferUsd,
    utilizationBps,
    borrowingIsolatedAsset: Boolean(fields.borrowing_isolated_asset),
    closable: Boolean(fields.closable),
    deposits,
    borrows,
    normalizedExposure: deposits.map((deposit) => ({
      protocol: "Suilend",
      account: ownerCapId,
      positionId: obligationId,
      assetType: deposit.assetType,
      coverUsd: deposit.marketValueUsd,
      coverMist: null,
      riskBudgetUsd: Math.max(0.01, deposit.marketValueUsd * 0.05),
      evidence: {
        source: "object",
        obligationId,
        ownerCapId,
        lendingMarketId: fields.lending_market_id,
        reserveArrayIndex: deposit.reserveArrayIndex,
        cTokenAmount: deposit.cTokenAmount,
        sampleTxDigest: txDigest,
      },
    })),
    boundary:
      "Sample-validated Suilend parser. Production auto-cover still needs user consent, risk caps, and partner-approved parser versioning.",
  };
}

async function main() {
  const client = new SuiClient({
    url: process.env.SUI_FULLNODE_URL ?? getFullnodeUrl("mainnet"),
  });
  const response = await client.getObject({
    id: obligationId,
    options: { showContent: true, showOwner: true, showType: true },
  });
  if (!response.data) {
    throw new Error(`Suilend obligation not found: ${obligationId}`);
  }
  const exposure = exposureFromFields(fieldsOf(response.data), response.data);
  console.log(JSON.stringify(exposure, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
