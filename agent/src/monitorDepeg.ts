import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import {
  SuiPriceServiceConnection,
  SuiPythClient,
} from "@pythnetwork/pyth-sui-js";
import { fetchDepegFromClient } from "../../app/src/lib/depeg";
import {
  buildDepegRecordPoolBreachTx,
  buildDepegRecordPoolRecoveryTx,
  readDepegPool,
  type DepegPoolState,
} from "../../app/src/lib/depegPool";
import {
  CLOCK,
  HERMES,
  PYTH_DEPEG_COVER_PKG,
  PYTH_DEPEG_POOL,
  PYTH_LENDING_PKG,
  PYTH_STATE,
  SUI_TYPE,
  SUIUSDE_FEED_ID,
  WORMHOLE_STATE,
} from "../../app/src/lib/deployment";
import { retryTransient } from "./retry.js";
import { suiRpcUrl } from "./rpc.js";
import { loadSuiKeypair } from "./suiSigner.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const MIST_PER_SUI = 1_000_000_000;
const EXECUTE_FLAG = "BACKSTOP_DEPEG_KEEPER_EXECUTE";

type Fields = Record<string, unknown>;

type DeploymentPool = {
  pool?: string;
  lendingMarket?: string;
  archived?: boolean;
};

type Deployment = {
  pythDepeg?: {
    coverPackage?: string;
    lendingPackage?: string;
    productionPool?: DeploymentPool;
    stagedProof?: DeploymentPool;
  };
};

type PoolConfig = {
  label: string;
  pkg: string;
  poolId: string;
  lendingPkg: string;
  lendingCoinType?: string;
  lendingMarket?: string;
};

type PoolPolicyState = {
  id: string;
  coverMist: bigint;
  expiryMs: number;
  activationMs?: number;
  epochId?: number | null;
  breached: boolean;
};

type PolicyMode = "wrapped-market" | "owned-policy" | "pool-state";

type PolicyRecord = {
  id: string;
  source: string;
  mode: PolicyMode;
  pkg: string;
  poolId: string;
  poolLabel: string;
  lendingPkg: string;
  lendingCoinType?: string;
  marketId?: string;
  owner?: string;
  poolStatePresent: boolean;
  coverMist: bigint;
  premiumPaidMist?: bigint;
  expiryMs: number;
  activationMs?: number;
  armed?: boolean;
  firstBreachMs?: number;
  breached: boolean;
  breachPrice?: bigint;
  epochId?: number | null;
  poolEpochClaimable: boolean;
};

type ParsedPolicyFields = {
  id: string;
  policyPoolId: string;
  coverMist: bigint;
  premiumPaidMist?: bigint;
  expiryMs: number;
  activationMs?: number;
  armed?: boolean;
  firstBreachMs?: number;
  breached: boolean;
  breachPrice?: bigint;
  epochId?: number | null;
};

type Action =
  | { kind: "record"; reason: string }
  | { kind: "claim"; reason: string }
  | { kind: "expire"; reason: string }
  | { kind: "wait"; reason: string };

type PoolAction =
  | { kind: "record-pool"; reason: string }
  | { kind: "recover-pool"; reason: string }
  | { kind: "wait"; reason: string };

const isRecord = (value: unknown): value is Fields =>
  typeof value === "object" && value !== null;

const fieldsOf = (value: unknown): Fields => {
  if (!isRecord(value) || !isRecord(value.fields)) return {};
  return value.fields;
};

const u64 = (value: unknown): bigint => {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" || typeof value === "string") {
    return BigInt(value);
  }
  const fields = fieldsOf(value);
  if (fields.value !== undefined) return u64(fields.value);
  throw new Error("unexpected u64 field");
};

const optionalU64 = (value: unknown): bigint | null =>
  value === undefined ? null : u64(value);

const optionalU64Number = (value: unknown): number | null => {
  const parsed = optionalU64(value);
  return parsed === null ? null : Number(parsed);
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

const ownerAddress = (owner: unknown): string | undefined => {
  if (!isRecord(owner) || typeof owner.AddressOwner !== "string") return;
  return normalizeSuiAddress(owner.AddressOwner);
};

const splitIds = (value: string | undefined): string[] =>
  (value ?? "")
    .split(/[\s,]+/)
    .map((part) => part.trim())
    .filter((part) => part.startsWith("0x"));

const readDeployment = (): Deployment =>
  JSON.parse(readFileSync(join(ROOT, "deployment.json"), "utf8")) as Deployment;

const addPoolConfig = (
  configs: Map<string, PoolConfig>,
  config: PoolConfig,
): void => {
  const key = config.poolId.toLowerCase();
  if (!configs.has(key)) configs.set(key, config);
};

function loadPoolConfigs(): PoolConfig[] {
  const deployment = readDeployment();
  const pyth = deployment.pythDepeg;
  const pkg =
    process.env.BACKSTOP_DEPEG_PACKAGE ??
    process.env.BACKSTOP_PKG ??
    pyth?.coverPackage ??
    PYTH_DEPEG_COVER_PKG;
  const lendingPkg =
    process.env.BACKSTOP_DEPEG_LENDING_PACKAGE ??
    process.env.LENDING_PKG ??
    pyth?.lendingPackage ??
    PYTH_LENDING_PKG;
  const configs = new Map<string, PoolConfig>();

  if (pyth?.productionPool?.pool) {
    addPoolConfig(configs, {
      label: "production",
      pkg,
      poolId: pyth.productionPool.pool,
      lendingPkg,
      lendingCoinType: process.env.COIN_TYPE,
      lendingMarket: pyth.productionPool.lendingMarket,
    });
  }
  if (pyth?.stagedProof?.pool && !pyth.stagedProof.archived) {
    addPoolConfig(configs, {
      label: "staged",
      pkg,
      poolId: pyth.stagedProof.pool,
      lendingPkg,
      lendingCoinType: process.env.COIN_TYPE,
      lendingMarket: pyth.stagedProof.lendingMarket,
    });
  }

  const envPool = process.env.BACKSTOP_DEPEG_POOL ?? process.env.POOL;
  if (envPool) {
    addPoolConfig(configs, {
      label: "env",
      pkg,
      poolId: envPool,
      lendingPkg,
      lendingCoinType: process.env.COIN_TYPE,
      lendingMarket:
        process.env.BACKSTOP_DEPEG_LENDING_MARKET ?? process.env.MARKET,
    });
  }

  if (configs.size === 0) {
    addPoolConfig(configs, {
      label: "default",
      pkg,
      poolId: PYTH_DEPEG_POOL,
      lendingPkg,
      lendingCoinType: process.env.COIN_TYPE,
    });
  }

  return [...configs.values()];
}

const thresholdUsd = (pool: DepegPoolState): number =>
  Number(pool.thresholdScaled) / 10 ** pool.expoMag;

const priceTriggered = (pool: DepegPoolState, reading: DepegReading): boolean =>
  reading.adversePrice <= thresholdUsd(pool) &&
  reading.confBps <= pool.maxConfBps;

const priceRecovered = (pool: DepegPoolState, reading: DepegReading): boolean =>
  reading.price > reading.conf &&
  reading.price - reading.conf > thresholdUsd(pool) &&
  reading.confBps <= pool.maxConfBps;

const sui = (mist: bigint): string =>
  `${(Number(mist) / MIST_PER_SUI).toFixed(6)} SUI`;

const pct = (value: number): string => `${value.toFixed(2)}%`;

const short = (id: string): string => `${id.slice(0, 10)}...${id.slice(-6)}`;

const iso = (ms: number): string => new Date(ms).toISOString();

function parsePolicyFields(fields: Fields): ParsedPolicyFields {
  return {
    id: objectId(fields.id),
    policyPoolId: objectId(fields.pool_id),
    coverMist: u64(fields.cover),
    premiumPaidMist: u64(fields.premium_paid),
    expiryMs: Number(u64(fields.expiry_ms)),
    activationMs: Number(u64(fields.activation_ms)),
    armed: Boolean(fields.armed),
    firstBreachMs: Number(u64(fields.first_breach_ms)),
    breached: Boolean(fields.breached),
    breachPrice: u64(fields.breach_price),
    epochId: optionalU64Number(fields.epoch_id),
  };
}

async function readPoliciesTableId(
  client: SuiClient,
  poolId: string,
): Promise<string | null> {
  const object = await retryTransient(`read pool ${short(poolId)}`, () =>
    client.getObject({ id: poolId, options: { showContent: true } }),
  );
  const fields = (object.data?.content as { fields?: Fields } | undefined)
    ?.fields;
  if (!fields) return null;
  return objectId(fieldsOf(fields.policies).id) || null;
}

async function readPoolPolicyStates(
  client: SuiClient,
  poolId: string,
): Promise<Map<string, PoolPolicyState>> {
  const tableId = await readPoliciesTableId(client, poolId);
  const states = new Map<string, PoolPolicyState>();
  if (!tableId) return states;

  let cursor: string | null | undefined;
  do {
    const page = await retryTransient(
      `list policy table ${short(tableId)}`,
      () => client.getDynamicFields({ parentId: tableId, cursor, limit: 50 }),
    );
    for (const field of page.data) {
      const id =
        typeof field.name.value === "string" ? field.name.value : undefined;
      if (!id) continue;
      const object = await retryTransient(
        `read policy state ${short(id)}`,
        () =>
          client.getObject({
            id: field.objectId,
            options: { showContent: true },
          }),
      );
      const valueFields = fieldsOf(
        (object.data?.content as { fields?: Fields } | undefined)?.fields
          ?.value,
      );
      if (Object.keys(valueFields).length === 0) continue;
      states.set(id.toLowerCase(), {
        id,
        coverMist: u64(valueFields.cover),
        expiryMs: Number(u64(valueFields.expiry_ms)),
        activationMs: optionalU64Number(valueFields.activation_ms) ?? undefined,
        epochId: optionalU64Number(valueFields.epoch_id),
        breached: Boolean(valueFields.breached),
      });
    }
    cursor = page.hasNextPage ? page.nextCursor : null;
  } while (cursor);

  return states;
}

function currentPoolEpochClaims(
  pool: DepegPoolState,
  policy: {
    activationMs?: number;
    expiryMs: number;
    epochId?: number | null;
  },
): boolean {
  return (
    pool.epochId !== null &&
    pool.epochBreached &&
    policy.epochId === pool.epochId &&
    policy.activationMs !== undefined &&
    pool.epochFirstBreachMs !== null &&
    pool.epochConfirmedMs !== null &&
    policy.activationMs <= pool.epochFirstBreachMs &&
    pool.epochConfirmedMs <= policy.expiryMs
  );
}

async function readMarketPolicy(
  client: SuiClient,
  config: PoolConfig,
  pool: DepegPoolState,
  poolStates: Map<string, PoolPolicyState>,
): Promise<PolicyRecord | null> {
  if (!config.lendingMarket) return null;
  const object = await retryTransient(
    `read lending market ${short(config.lendingMarket)}`,
    () =>
      client.getObject({
        id: config.lendingMarket as string,
        options: { showContent: true },
      }),
  );
  const marketFields = (object.data?.content as { fields?: Fields } | undefined)
    ?.fields;
  const policy = marketFields?.policy;
  if (!isRecord(policy)) return null;
  const policyFields = fieldsOf(policy);
  const { policyPoolId, ...parsed } = parsePolicyFields(policyFields);
  if (policyPoolId.toLowerCase() !== config.poolId.toLowerCase()) return null;
  return {
    ...parsed,
    source: `${config.label} lending market`,
    mode: "wrapped-market",
    pkg: config.pkg,
    poolId: config.poolId,
    poolLabel: config.label,
    lendingPkg: config.lendingPkg,
    lendingCoinType: config.lendingCoinType,
    marketId: config.lendingMarket,
    poolStatePresent: poolStates.has(parsed.id.toLowerCase()),
    poolEpochClaimable: currentPoolEpochClaims(pool, parsed),
  };
}

async function readDirectPolicy(
  client: SuiClient,
  policyId: string,
): Promise<(ParsedPolicyFields & { owner?: string }) | null> {
  const object = await retryTransient(`read policy ${short(policyId)}`, () =>
    client.getObject({
      id: policyId,
      options: { showContent: true, showOwner: true, showType: true },
    }),
  );
  if (!object.data?.type?.includes("::pyth_cover_pool::Policy<")) return null;
  const fields = (object.data.content as { fields?: Fields } | undefined)
    ?.fields;
  if (!fields) return null;
  return {
    ...parsePolicyFields(fields),
    owner: ownerAddress(object.data.owner),
  };
}

async function discoverPolicies(
  client: SuiClient,
  configs: PoolConfig[],
): Promise<{
  pools: Map<string, DepegPoolState>;
  policies: PolicyRecord[];
  warnings: string[];
}> {
  const pools = new Map<string, DepegPoolState>();
  const poolPolicyStates = new Map<string, Map<string, PoolPolicyState>>();
  const policies = new Map<string, PolicyRecord>();
  const warnings: string[] = [];
  const envPolicyIds = splitIds(
    process.env.BACKSTOP_DEPEG_POLICY_IDS ??
      process.env.DEPEG_POLICY_IDS ??
      process.env.POLICY,
  );
  const envMarkets = splitIds(
    process.env.BACKSTOP_DEPEG_LENDING_MARKETS ??
      process.env.DEPEG_LENDING_MARKETS,
  );

  for (const config of configs) {
    const pool = await retryTransient(`read ${config.label} depeg pool`, () =>
      readDepegPool(client, config.poolId),
    );
    pools.set(config.poolId.toLowerCase(), pool);
    const poolStates = await readPoolPolicyStates(client, config.poolId);
    poolPolicyStates.set(config.poolId.toLowerCase(), poolStates);
    const configuredMarkets = [config.lendingMarket, ...envMarkets].filter(
      (market): market is string => Boolean(market),
    );

    for (const marketId of configuredMarkets) {
      const marketPolicy = await readMarketPolicy(
        client,
        { ...config, lendingMarket: marketId },
        pool,
        poolStates,
      );
      if (marketPolicy)
        policies.set(marketPolicy.id.toLowerCase(), marketPolicy);
    }

    for (const state of poolStates.values()) {
      if (policies.has(state.id.toLowerCase())) continue;
      policies.set(state.id.toLowerCase(), {
        id: state.id,
        source: `${config.label} pool table`,
        mode: "pool-state",
        pkg: config.pkg,
        poolId: config.poolId,
        poolLabel: config.label,
        lendingPkg: config.lendingPkg,
        poolStatePresent: true,
        coverMist: state.coverMist,
        expiryMs: state.expiryMs,
        activationMs: state.activationMs,
        epochId: state.epochId,
        breached: state.breached,
        poolEpochClaimable: currentPoolEpochClaims(pool, state),
      });
    }
  }

  for (const policyId of envPolicyIds) {
    if (policies.has(policyId.toLowerCase())) continue;
    const direct = await readDirectPolicy(client, policyId);
    if (!direct) {
      warnings.push(
        `${short(policyId)} was supplied in env but is not a readable top-level policy`,
      );
      continue;
    }
    const config = configs.find(
      (candidate) =>
        candidate.poolId.toLowerCase() === direct.policyPoolId.toLowerCase(),
    );
    if (!config) {
      warnings.push(
        `${short(policyId)} belongs to pool ${short(direct.policyPoolId)}; set BACKSTOP_DEPEG_POOL to monitor it`,
      );
      continue;
    }
    const pool = pools.get(config.poolId.toLowerCase());
    if (!pool) continue;
    policies.set(policyId.toLowerCase(), {
      id: policyId,
      source: "env policy id",
      mode: "owned-policy",
      pkg: config.pkg,
      poolId: config.poolId,
      poolLabel: config.label,
      lendingPkg: config.lendingPkg,
      owner: direct.owner,
      poolStatePresent:
        poolPolicyStates
          .get(config.poolId.toLowerCase())
          ?.has(policyId.toLowerCase()) ?? false,
      coverMist: direct.coverMist,
      premiumPaidMist: direct.premiumPaidMist,
      expiryMs: direct.expiryMs,
      activationMs: direct.activationMs,
      epochId: direct.epochId,
      armed: direct.armed,
      firstBreachMs: direct.firstBreachMs,
      breached: direct.breached,
      breachPrice: direct.breachPrice,
      poolEpochClaimable: currentPoolEpochClaims(pool, direct),
    });
  }

  return { pools, policies: [...policies.values()], warnings };
}

function decidePoolAction(
  pool: DepegPoolState,
  reading: DepegReading,
  nowMs: number,
): PoolAction {
  if (pool.epochId === null) {
    return {
      kind: "wait",
      reason: "legacy pool has no pool-level epoch state",
    };
  }

  if (pool.epochBreached) {
    if (priceRecovered(pool, reading)) {
      return {
        kind: "recover-pool",
        reason: "price lower confidence edge recovered above floor",
      };
    }
    return {
      kind: "wait",
      reason: "pool epoch is confirmed; waiting for recovery",
    };
  }

  if (pool.epochArmed) {
    if (priceRecovered(pool, reading)) {
      return {
        kind: "recover-pool",
        reason: "price recovered before pool dwell confirmation",
      };
    }
    if (!priceTriggered(pool, reading)) {
      return {
        kind: "wait",
        reason:
          "pool epoch armed, but current confidence band is not below floor",
      };
    }
    const readyAt = (pool.epochFirstBreachMs ?? 0) + pool.minDwellSecs * 1000;
    if (nowMs < readyAt) {
      return {
        kind: "wait",
        reason: `pool dwell confirmation opens at ${iso(readyAt)}`,
      };
    }
    return {
      kind: "record-pool",
      reason: "feed is still below floor and pool dwell elapsed",
    };
  }

  if (priceTriggered(pool, reading)) {
    return {
      kind: "record-pool",
      reason: "feed is below floor and pool epoch can arm",
    };
  }

  return { kind: "wait", reason: "adverse price is above pool floor" };
}

function decideAction(
  policy: PolicyRecord,
  pool: DepegPoolState,
  reading: DepegReading,
  nowMs: number,
): Action {
  if (policy.poolEpochClaimable) {
    if (policy.mode === "pool-state") {
      return {
        kind: "wait",
        reason:
          "pool epoch confirmed, but no configured policy holder or lending market can claim it",
      };
    }
    return {
      kind: "claim",
      reason: "policy is claimable through the confirmed pool epoch",
    };
  }

  if (policy.breached) {
    if (policy.mode === "pool-state") {
      return {
        kind: "wait",
        reason:
          "latched, but no configured policy holder or lending market can claim it",
      };
    }
    return { kind: "claim", reason: "policy is already latched" };
  }

  if (nowMs > policy.expiryMs) {
    if (policy.poolStatePresent) {
      return {
        kind: "expire",
        reason: "expired unlatched policy can be swept by id",
      };
    }
    return {
      kind: "wait",
      reason: "expired policy liability is already absent",
    };
  }

  if (!priceTriggered(pool, reading)) {
    return {
      kind: "wait",
      reason: `adverse price is above ${policy.poolLabel} floor`,
    };
  }

  if (pool.epochArmed || pool.epochBreached) {
    return {
      kind: "wait",
      reason: "pool-level epoch is open; pool keeper action takes priority",
    };
  }

  if (policy.activationMs !== undefined && nowMs < policy.activationMs) {
    return {
      kind: "wait",
      reason: `activation delay ends at ${iso(policy.activationMs)}`,
    };
  }

  if (policy.mode === "pool-state") {
    return {
      kind: "wait",
      reason:
        "configure the lending market or top-level policy id to record breach",
    };
  }

  if (!policy.armed) {
    return {
      kind: "record",
      reason: "feed is below floor and policy can arm dwell",
    };
  }

  const firstBreachMs = policy.firstBreachMs ?? 0;
  const readyAt = firstBreachMs + pool.minDwellSecs * 1000;
  if (nowMs < readyAt) {
    return {
      kind: "wait",
      reason: `dwell confirmation opens at ${iso(readyAt)}`,
    };
  }

  return {
    kind: "record",
    reason: "feed is still below floor and dwell window has elapsed",
  };
}

async function buildRecordTx(
  client: SuiClient,
  policy: PolicyRecord,
): Promise<Transaction> {
  const tx = new Transaction();
  const updates = await new SuiPriceServiceConnection(
    HERMES,
  ).getPriceFeedsUpdateData([SUIUSDE_FEED_ID]);
  const pyth = new SuiPythClient(client, PYTH_STATE, WORMHOLE_STATE);
  const [priceInfoObjectId] = await pyth.updatePriceFeeds(tx, updates, [
    SUIUSDE_FEED_ID,
  ]);

  if (policy.mode === "wrapped-market") {
    if (!policy.marketId) throw new Error("missing lending market id");
    tx.moveCall({
      target: `${policy.lendingPkg}::pyth_lending_demo::record_shortfall`,
      ...(policy.lendingCoinType
        ? { typeArguments: [policy.lendingCoinType] }
        : {}),
      arguments: [
        tx.object(policy.marketId),
        tx.object(policy.poolId),
        tx.object(priceInfoObjectId),
        tx.object(CLOCK),
      ],
    });
    return tx;
  }

  tx.moveCall({
    target: `${policy.pkg}::pyth_cover_pool::record_breach`,
    typeArguments: [policy.lendingCoinType ?? SUI_TYPE],
    arguments: [
      tx.object(policy.poolId),
      tx.object(policy.id),
      tx.object(priceInfoObjectId),
      tx.object(CLOCK),
    ],
  });
  return tx;
}

function buildClaimTx(policy: PolicyRecord, recipient: string): Transaction {
  const tx = new Transaction();
  if (policy.mode === "wrapped-market") {
    if (!policy.marketId) throw new Error("missing lending market id");
    tx.moveCall({
      target: `${policy.lendingPkg}::pyth_lending_demo::cover_shortfall`,
      ...(policy.lendingCoinType
        ? { typeArguments: [policy.lendingCoinType] }
        : {}),
      arguments: [tx.object(policy.marketId), tx.object(policy.poolId)],
    });
    return tx;
  }

  const payout = tx.moveCall({
    target: `${policy.pkg}::pyth_cover_pool::claim_latched`,
    typeArguments: [policy.lendingCoinType ?? SUI_TYPE],
    arguments: [tx.object(policy.poolId), tx.object(policy.id)],
  });
  tx.transferObjects([payout], recipient);
  return tx;
}

function buildExpireTx(policy: PolicyRecord): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${policy.pkg}::pyth_cover_pool::expire_policy_by_id`,
    typeArguments: [policy.lendingCoinType ?? SUI_TYPE],
    arguments: [
      tx.object(policy.poolId),
      tx.pure.id(policy.id),
      tx.object(CLOCK),
    ],
  });
  return tx;
}

function printPool(
  config: PoolConfig,
  pool: DepegPoolState,
  reading: DepegReading,
): void {
  const headroom =
    pool.fundsMist > pool.totalCoverMist
      ? pool.fundsMist - pool.totalCoverMist
      : 0n;
  const utilization =
    pool.fundsMist > 0n
      ? (Number(pool.totalCoverMist) / Number(pool.fundsMist)) * 100
      : 0;

  console.log(`pool ${config.label}: ${config.poolId}`);
  console.log(
    `  tvl ${sui(pool.fundsMist)} | active ${sui(pool.totalCoverMist)} | headroom ${sui(headroom)} | utilization ${pct(utilization)}`,
  );
  console.log(
    `  floor $${thresholdUsd(pool).toFixed(6)} | dwell ${pool.minDwellSecs}s | activation ${pool.activationDelaySecs}s | paused ${pool.paused ? "yes" : "no"}`,
  );
  console.log(
    `  keeper bounty ${sui(pool.keeperBountyMist)} | treasury ${sui(pool.treasuryMist)} | live trigger ${priceTriggered(pool, reading) ? "yes" : "no"}`,
  );
  if (pool.epochId !== null) {
    const action = decidePoolAction(pool, reading, Date.now());
    const epochStatus = pool.epochBreached
      ? "breached"
      : pool.epochArmed
        ? "armed"
        : "idle";
    console.log(
      `  epoch #${pool.epochId} ${epochStatus} | pool action ${action.kind}: ${action.reason}`,
    );
  }
}

function printPolicy(policy: PolicyRecord, action: Action): void {
  const status = policy.poolEpochClaimable
    ? "pool-claimable"
    : policy.breached
      ? "latched"
      : Date.now() > policy.expiryMs
        ? "expired"
        : policy.armed
          ? "armed"
          : "active";
  const holder =
    policy.mode === "wrapped-market"
      ? `market ${short(policy.marketId ?? "")}`
      : policy.mode === "owned-policy"
        ? `owner ${policy.owner ? short(policy.owner) : "unknown"}`
        : "pool table only";

  console.log(`policy ${short(policy.id)} (${policy.poolLabel}, ${status})`);
  console.log(
    `  source ${policy.source} | ${holder} | cover ${sui(policy.coverMist)} | expires ${iso(policy.expiryMs)}`,
  );
  if (policy.activationMs !== undefined) {
    console.log(
      `  activation ${iso(policy.activationMs)} | epoch ${policy.epochId ?? "legacy"} | armed ${policy.armed ? "yes" : "no"} | breached ${policy.breached ? "yes" : "no"}`,
    );
  }
  console.log(`  action ${action.kind}: ${action.reason}`);
}

function canExecutePolicy(
  policy: PolicyRecord,
  action: Action,
  sender: string,
): string | null {
  if (action.kind === "wait") return "no executable action";
  if (policy.mode === "pool-state" && action.kind !== "expire") {
    return "policy holder or lending market is not configured";
  }
  if (
    policy.mode === "owned-policy" &&
    action.kind !== "expire" &&
    policy.owner &&
    normalizeSuiAddress(policy.owner) !== sender
  ) {
    return `signer ${short(sender)} does not own policy ${short(policy.id)}`;
  }
  return null;
}

async function executeActions(
  client: SuiClient,
  configs: PoolConfig[],
  policies: PolicyRecord[],
  pools: Map<string, DepegPoolState>,
  reading: DepegReading,
): Promise<void> {
  if (process.env[EXECUTE_FLAG] !== "1") {
    console.log(`\ndry-run: set ${EXECUTE_FLAG}=1 to send actionable PTBs`);
    return;
  }

  const keypair = loadSuiKeypair();
  const sender = normalizeSuiAddress(keypair.getPublicKey().toSuiAddress());
  let sent = 0;

  console.log(`\nexecute: signer ${sender}`);
  for (const config of configs) {
    const pool = pools.get(config.poolId.toLowerCase());
    if (!pool) continue;
    const action = decidePoolAction(pool, reading, Date.now());
    if (action.kind === "wait") {
      console.log(`skip pool ${config.label}: ${action.reason}`);
      continue;
    }
    const tx =
      action.kind === "record-pool"
        ? await buildDepegRecordPoolBreachTx({
            client,
            pkg: config.pkg,
            poolId: config.poolId,
            feedId: pool.feedIdHex,
          })
        : await buildDepegRecordPoolRecoveryTx({
            client,
            pkg: config.pkg,
            poolId: config.poolId,
            feedId: pool.feedIdHex,
          });
    tx.setSender(sender);
    const result = await retryTransient(`${action.kind} ${config.label}`, () =>
      client.signAndExecuteTransaction({
        signer: keypair,
        transaction: tx,
        options: { showEffects: true, showEvents: true },
      }),
    );
    const status = result.effects?.status.status;
    console.log(`${action.kind} ${config.label}: ${status} ${result.digest}`);
    if (status !== "success") {
      throw new Error(result.effects?.status.error ?? `${action.kind} failed`);
    }
    await client.waitForTransaction({ digest: result.digest });
    sent += 1;
  }

  for (const policy of policies) {
    const pool = pools.get(policy.poolId.toLowerCase());
    if (!pool) continue;
    const action = decideAction(policy, pool, reading, Date.now());
    const skipReason = canExecutePolicy(policy, action, sender);
    if (skipReason) {
      console.log(`skip ${short(policy.id)}: ${skipReason}`);
      continue;
    }

    const tx =
      action.kind === "record"
        ? await buildRecordTx(client, policy)
        : action.kind === "claim"
          ? buildClaimTx(policy, sender)
          : buildExpireTx(policy);
    tx.setSender(sender);

    const result = await retryTransient(
      `${action.kind} ${short(policy.id)}`,
      () =>
        client.signAndExecuteTransaction({
          signer: keypair,
          transaction: tx,
          options: { showEffects: true, showEvents: true },
        }),
    );
    const status = result.effects?.status.status;
    console.log(
      `${action.kind} ${short(policy.id)}: ${status} ${result.digest}`,
    );
    if (status !== "success") {
      throw new Error(result.effects?.status.error ?? `${action.kind} failed`);
    }
    await client.waitForTransaction({ digest: result.digest });
    sent += 1;
  }

  if (sent === 0) console.log("execute: no PTBs sent");
}

type DepegReading = Awaited<ReturnType<typeof fetchDepegFromClient>>[number];

async function main(): Promise<void> {
  const client = new SuiClient({ url: suiRpcUrl("mainnet") });
  const configs = loadPoolConfigs();
  const [readings, discovered] = await Promise.all([
    retryTransient("read Pyth depeg feeds", () => fetchDepegFromClient(client)),
    discoverPolicies(client, configs),
  ]);
  const flagship = readings.find((reading) => reading.flagship);
  if (!flagship) throw new Error("suiUSDe price read missing");

  console.log("Backstop depeg keeper monitor");
  console.log(`rpc: ${suiRpcUrl("mainnet")}`);
  console.log(
    `suiUSDe: $${flagship.price.toFixed(6)} + conf $${flagship.conf.toFixed(6)} = adverse $${flagship.adversePrice.toFixed(6)} (${flagship.confBps.toFixed(2)} bps)`,
  );
  console.log(`published: ${iso(flagship.publishMs)}`);
  console.log(`configured pools: ${configs.length}`);
  console.log(`discovered policies: ${discovered.policies.length}\n`);

  for (const config of configs) {
    const pool = discovered.pools.get(config.poolId.toLowerCase());
    if (pool) printPool(config, pool, flagship);
  }

  if (discovered.warnings.length > 0) {
    console.log("\nwarnings:");
    for (const warning of discovered.warnings) console.log(`  ${warning}`);
  }

  console.log("\npolicy actions:");
  if (discovered.policies.length === 0) {
    console.log(
      "  none - set BACKSTOP_DEPEG_POLICY_IDS or configure a pool/market",
    );
  }
  for (const policy of discovered.policies) {
    const pool = discovered.pools.get(policy.poolId.toLowerCase());
    if (!pool) continue;
    printPolicy(policy, decideAction(policy, pool, flagship, Date.now()));
  }

  await executeActions(
    client,
    configs,
    discovered.policies,
    discovered.pools,
    flagship,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
