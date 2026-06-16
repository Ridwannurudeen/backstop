import type { SuiClient, SuiObjectData } from "@mysten/sui/client";
import type {
  LendingPosition,
  LendingPositionType,
} from "@naviprotocol/lending";

export type DepegPositionProtocol = "Suilend" | "NAVI" | "Manual";

export type NaviExposureLine = {
  id: string;
  market: string;
  side: "supply" | "borrow";
  symbol: string;
  amount: string;
  valueUsd: number;
  coinType: string;
};

export type NaviExposureSummary = {
  lines: NaviExposureLine[];
  usdeLines: NaviExposureLine[];
  totalSupplyUsd: number;
  totalBorrowUsd: number;
  usdeSupplyUsd: number;
  usdeBorrowUsd: number;
};

export type SuilendExposureLine = {
  id: string;
  obligationId: string;
  side: "supply" | "borrow";
  symbol: string;
  valueUsd: number;
  coinType: string;
};

export type SuilendExposureSummary = {
  lines: SuilendExposureLine[];
  usdeLines: SuilendExposureLine[];
  totalSupplyUsd: number;
  totalBorrowUsd: number;
  usdeSupplyUsd: number;
  usdeBorrowUsd: number;
  ownerCapCount: number;
};

export type DepegPositionObject = {
  id: string;
  type: string;
  label: string;
  protocol: DepegPositionProtocol;
  confidence: "high" | "medium" | "low";
  fieldKeys: string[];
};

type Fields = Record<string, unknown>;

const POSITION_TERMS = [
  "suilend",
  "navi",
  "naviprotocol",
  "obligation",
  "owner_cap",
  "ownercap",
  "position",
  "lending",
  "ctoken",
];

const WAD = 1e18;
const hx = (a: string, b: string) => "0x" + a + b;
const SUILEND_PKG = hx(
  "f95b06141ed4a174f239417323bde3",
  "f209b972f5930d8521ea38a52aff3a6ddf",
);
const SUILEND_MAIN_POOL = `${SUILEND_PKG}::suilend::MAIN_POOL`;
const SUILEND_OWNER_CAP_TYPE = `${SUILEND_PKG}::lending_market::ObligationOwnerCap<${SUILEND_MAIN_POOL}>`;
const SUILEND_OBLIGATION_TYPE = `${SUILEND_PKG}::obligation::Obligation<${SUILEND_MAIN_POOL}>`;

const NAVI_POSITION_SIDES: Record<LendingPositionType, "supply" | "borrow"> = {
  "navi-lending-supply": "supply",
  "navi-lending-borrow": "borrow",
  "navi-lending-emode-supply": "supply",
  "navi-lending-emode-borrow": "borrow",
};

const isRecord = (v: unknown): v is Fields =>
  typeof v === "object" && v !== null;

const fieldsOf = (content: unknown): Fields => {
  if (!isRecord(content) || !isRecord(content.fields)) return {};
  return content.fields;
};

const objectId = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (!isRecord(value)) return "";
  if (typeof value.id === "string") return value.id;
  if (typeof value.bytes === "string") {
    return value.bytes.startsWith("0x") ? value.bytes : `0x${value.bytes}`;
  }
  const fields = fieldsOf(value);
  if (typeof fields.id === "string") return fields.id;
  if (typeof fields.bytes === "string") {
    return fields.bytes.startsWith("0x") ? fields.bytes : `0x${fields.bytes}`;
  }
  return "";
};

const finiteUsd = (value: string): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const wadUsd = (value: unknown): number => {
  const raw = fieldsOf(value).value;
  const parsed =
    typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed / WAD : 0;
};

const normalizedCoinType = (value: unknown): string => {
  const name = fieldsOf(value).name;
  if (typeof name !== "string" || name.length === 0) return "";
  return name.startsWith("0x") ? name : `0x${name}`;
};

const symbolFromCoinType = (coinType: string): string =>
  coinType.split("::").at(-1) ?? coinType;

const humanize = (type: string): string => {
  const struct = (type.split("::").at(-1) ?? type).replace(/<.*$/, "");
  return struct
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

const protocolOf = (haystack: string): DepegPositionProtocol => {
  if (haystack.includes("suilend")) return "Suilend";
  if (haystack.includes("navi") || haystack.includes("naviprotocol")) {
    return "NAVI";
  }
  return "Manual";
};

const confidenceOf = (
  haystack: string,
  protocol: DepegPositionProtocol,
): DepegPositionObject["confidence"] => {
  if (protocol !== "Manual") return "high";
  if (
    haystack.includes("obligation") ||
    haystack.includes("owner_cap") ||
    haystack.includes("ownercap") ||
    haystack.includes("position")
  ) {
    return "medium";
  }
  return "low";
};

const toPositionObject = (
  data: SuiObjectData,
  includeUnmatched: boolean,
): DepegPositionObject | null => {
  if (!data.type) return null;

  const fieldKeys = Object.keys(fieldsOf(data.content)).sort();
  const haystack = `${data.type} ${fieldKeys.join(" ")}`.toLowerCase();
  const matched = POSITION_TERMS.some((term) => haystack.includes(term));
  if (!matched && !includeUnmatched) return null;

  const protocol = protocolOf(haystack);
  const label = `${protocol === "Manual" ? "" : `${protocol} `}${humanize(
    data.type,
  )}`;

  return {
    id: data.objectId,
    type: data.type,
    label,
    protocol,
    confidence: confidenceOf(haystack, protocol),
    fieldKeys,
  };
};

export async function fetchOwnedPositionObjects(
  client: SuiClient,
  owner: string,
): Promise<DepegPositionObject[]> {
  const positions: DepegPositionObject[] = [];
  let cursor: string | null | undefined;

  for (let page = 0; page < 5; page += 1) {
    const response = await client.getOwnedObjects({
      owner,
      cursor,
      limit: 50,
      options: { showContent: true, showType: true },
    });

    for (const object of response.data) {
      if (!object.data) continue;
      const position = toPositionObject(object.data, false);
      if (position) positions.push(position);
    }

    if (!response.hasNextPage || !response.nextCursor) break;
    cursor = response.nextCursor;
  }

  return positions.sort((a, b) => {
    if (a.protocol !== b.protocol) return a.protocol.localeCompare(b.protocol);
    if (a.confidence !== b.confidence) {
      return a.confidence.localeCompare(b.confidence);
    }
    return a.label.localeCompare(b.label);
  });
}

const naviLineOf = (position: LendingPosition): NaviExposureLine | null => {
  const detail = position[position.type];
  if (!detail) return null;
  return {
    id: position.id,
    market: position.market,
    side: NAVI_POSITION_SIDES[position.type],
    symbol: detail.token.symbol,
    amount: detail.amount,
    valueUsd: finiteUsd(detail.valueUSD),
    coinType: detail.token.coinType,
  };
};

const isUsdeLine = (line: NaviExposureLine): boolean => {
  const haystack = `${line.symbol} ${line.coinType}`.toLowerCase();
  return haystack.includes("usde");
};

const isSuilendUsdeLine = (line: SuilendExposureLine): boolean => {
  const haystack = `${line.symbol} ${line.coinType}`.toLowerCase();
  return haystack.includes("usde");
};

export async function fetchNaviExposure(
  client: SuiClient,
  owner: string,
): Promise<NaviExposureSummary> {
  const { getLendingPositions } = await import("@naviprotocol/lending");
  const positions = await getLendingPositions(owner, {
    client,
    env: "prod",
    markets: ["main", "sui-eco"],
  });
  const lines = positions
    .map(naviLineOf)
    .filter((line): line is NaviExposureLine => line !== null)
    .filter((line) => line.valueUsd > 0)
    .sort((a, b) => b.valueUsd - a.valueUsd);
  const usdeLines = lines.filter(isUsdeLine);

  return {
    lines,
    usdeLines,
    totalSupplyUsd: lines
      .filter((line) => line.side === "supply")
      .reduce((sum, line) => sum + line.valueUsd, 0),
    totalBorrowUsd: lines
      .filter((line) => line.side === "borrow")
      .reduce((sum, line) => sum + line.valueUsd, 0),
    usdeSupplyUsd: usdeLines
      .filter((line) => line.side === "supply")
      .reduce((sum, line) => sum + line.valueUsd, 0),
    usdeBorrowUsd: usdeLines
      .filter((line) => line.side === "borrow")
      .reduce((sum, line) => sum + line.valueUsd, 0),
  };
}

const emptySuilendExposure = (ownerCapCount = 0): SuilendExposureSummary => ({
  lines: [],
  usdeLines: [],
  totalSupplyUsd: 0,
  totalBorrowUsd: 0,
  usdeSupplyUsd: 0,
  usdeBorrowUsd: 0,
  ownerCapCount,
});

const suilendLineOf = (
  obligationId: string,
  side: "supply" | "borrow",
  value: unknown,
  index: number,
): SuilendExposureLine | null => {
  const fields = fieldsOf(value);
  const coinType = normalizedCoinType(fields.coin_type);
  const valueUsd = wadUsd(fields.market_value);
  if (!coinType || valueUsd <= 0) return null;

  return {
    id: `${obligationId}:${side}:${index}`,
    obligationId,
    side,
    symbol: symbolFromCoinType(coinType),
    valueUsd,
    coinType,
  };
};

const fetchSuilendSymbols = async (
  client: SuiClient,
  coinTypes: string[],
): Promise<Map<string, string>> => {
  const unique = [...new Set(coinTypes)];
  const entries = await Promise.all(
    unique.map(async (coinType) => {
      try {
        const metadata = await client.getCoinMetadata({ coinType });
        return [
          coinType,
          metadata?.symbol ?? symbolFromCoinType(coinType),
        ] as const;
      } catch {
        return [coinType, symbolFromCoinType(coinType)] as const;
      }
    }),
  );
  return new Map(entries);
};

export const parseSuilendObligationObjects = (
  objects: SuiObjectData[],
): SuilendExposureLine[] => {
  const lines: SuilendExposureLine[] = [];

  for (const data of objects) {
    if (!data.type?.startsWith(SUILEND_OBLIGATION_TYPE)) continue;
    const fields = fieldsOf(data.content);
    const obligationId = data.objectId;
    const deposits = Array.isArray(fields.deposits) ? fields.deposits : [];
    const borrows = Array.isArray(fields.borrows) ? fields.borrows : [];

    for (const [index, deposit] of deposits.entries()) {
      const line = suilendLineOf(obligationId, "supply", deposit, index);
      if (line) lines.push(line);
    }
    for (const [index, borrow] of borrows.entries()) {
      const line = suilendLineOf(obligationId, "borrow", borrow, index);
      if (line) lines.push(line);
    }
  }

  return lines;
};

export async function fetchSuilendExposure(
  client: SuiClient,
  owner: string,
): Promise<SuilendExposureSummary> {
  const caps: SuiObjectData[] = [];
  let cursor: string | null | undefined;

  for (let page = 0; page < 5; page += 1) {
    const response = await client.getOwnedObjects({
      owner,
      cursor,
      limit: 50,
      filter: { StructType: SUILEND_OWNER_CAP_TYPE },
      options: { showContent: true, showType: true },
    });

    for (const cap of response.data) {
      if (cap.data) caps.push(cap.data);
    }

    if (!response.hasNextPage || !response.nextCursor) break;
    cursor = response.nextCursor;
  }

  const obligationIds = [
    ...new Set(
      caps
        .map((cap) => objectId(fieldsOf(cap.content).obligation_id))
        .filter((id) => id.startsWith("0x")),
    ),
  ];
  if (obligationIds.length === 0) {
    return emptySuilendExposure(caps.length);
  }

  const objects = await client.multiGetObjects({
    ids: obligationIds,
    options: { showContent: true, showType: true },
  });
  const lines = parseSuilendObligationObjects(
    objects
      .map((response) => response.data)
      .filter((data): data is SuiObjectData => data !== undefined),
  );

  const symbols = await fetchSuilendSymbols(
    client,
    lines.map((line) => line.coinType),
  );
  const resolvedLines = lines
    .map((line) => ({
      ...line,
      symbol: symbols.get(line.coinType) ?? line.symbol,
    }))
    .sort((a, b) => b.valueUsd - a.valueUsd);
  const usdeLines = resolvedLines.filter(isSuilendUsdeLine);

  return {
    lines: resolvedLines,
    usdeLines,
    totalSupplyUsd: resolvedLines
      .filter((line) => line.side === "supply")
      .reduce((sum, line) => sum + line.valueUsd, 0),
    totalBorrowUsd: resolvedLines
      .filter((line) => line.side === "borrow")
      .reduce((sum, line) => sum + line.valueUsd, 0),
    usdeSupplyUsd: usdeLines
      .filter((line) => line.side === "supply")
      .reduce((sum, line) => sum + line.valueUsd, 0),
    usdeBorrowUsd: usdeLines
      .filter((line) => line.side === "borrow")
      .reduce((sum, line) => sum + line.valueUsd, 0),
    ownerCapCount: caps.length,
  };
}

export async function readPositionObject(
  client: SuiClient,
  objectId: string,
): Promise<DepegPositionObject> {
  const response = await client.getObject({
    id: objectId,
    options: { showContent: true, showType: true },
  });
  if (response.error) {
    throw new Error(`object read failed: ${response.error.code}`);
  }
  if (!response.data) {
    throw new Error("object not found");
  }

  const position = toPositionObject(response.data, true);
  if (!position) {
    throw new Error("object has no readable Move type");
  }
  return position;
}
