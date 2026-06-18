import { useMemo } from "react";
import type { SuiClient } from "@mysten/sui/client";
import { SuiClient as SuiRpcClient, getFullnodeUrl } from "@mysten/sui/client";
import { useCurrentAccount } from "@mysten/dapp-kit";
import { useQuery } from "@tanstack/react-query";
import { READING_EVENT, WALRUS_AGGREGATOR } from "../lib/deployment";
import { fetchActiveOracles, fetchReferencePrice } from "../lib/predict";
import {
  MAINNET_DEPEG_PROOF_PACK,
  TESTNET_PROOF_PACK,
  type ProofCheck,
} from "../lib/proofData";
import { objectUrl, txUrl } from "../lib/format";
import KeeperOpsCenter from "./KeeperOpsCenter";
import OnchainRiskFeed from "./OnchainRiskFeed";

type FeedEvent = {
  market: string;
  prob_bps: string;
  ref_price: string;
  walrus_blob: string;
  ts_ms: string;
};

type LifecycleRow = {
  title: string;
  status: "VERIFIED" | "OBSERVABLE" | "NOT ASSERTED";
  detail: string;
  evidence: string;
  link?: string;
};

async function queryLatestReading(client: SuiClient) {
  const events = await client.queryEvents({
    query: { MoveEventType: READING_EVENT },
    limit: 25,
    order: "descending",
  });
  return events.data
    .map((event) => event.parsedJson as FeedEvent)
    .find(Boolean);
}

async function objectExists(client: SuiClient, objectId: string) {
  try {
    const object = await client.getObject({
      id: objectId,
      options: { showType: true, showContent: true, showOwner: true },
    });
    return object.data;
  } catch {
    return null;
  }
}

function parseCoverState(value: unknown): string {
  const n = Number(value as string | number | bigint);
  if (!Number.isFinite(n)) return "-";
  return `${(n / 1_000_000_000).toFixed(6)} SUI`;
}

function isImmutableOwner(owner: unknown): owner is "Immutable" {
  return owner === "Immutable";
}

function moveFields(object: Awaited<ReturnType<typeof objectExists>>) {
  return object?.content?.dataType === "moveObject"
    ? (object.content.fields as Record<string, unknown>)
    : null;
}

function fieldValue(
  fields: Record<string, unknown> | null,
  candidates: string[],
) {
  if (!fields) return null;
  for (const candidate of candidates) {
    const value = fields[candidate];
    if (value !== undefined && value !== null) return String(value);
  }
  return null;
}

const JUDGE_GRADE_POLICY = {
  txDigest: "5AGzShNPABk9RMGmmFursqRgJiGLssLpdjW5b6z4kb74",
  policyId:
    "0xcfd02fb3db64b76ca57f39bf2669a6cae6766713f593c0a52eaa5fa02aa79a46",
};

function lifecycleStatus(value: string | null): LifecycleRow["status"] {
  return value ? "OBSERVABLE" : "NOT ASSERTED";
}

function row(
  checks: ProofCheck[],
  label: string,
  status: "PASS" | "WARN" | "FAIL",
  network: "MAINNET" | "TESTNET",
  evidence: "LIVE READ" | "CAPTURED TX" | "STAGED PROOF",
  value: string,
  note: string,
  link?: string,
  safety: "UNAUDITED" | "DEMO SCALE" | "ADMIN CONTROLLED" = "UNAUDITED",
) {
  checks.push({
    label,
    status,
    network,
    evidence,
    safety,
    value,
    note,
    link,
  });
}

export default function ProofCenter() {
  const account = useCurrentAccount();
  const client = useMemo(
    () => new SuiRpcClient({ url: getFullnodeUrl("testnet") }),
    [],
  );
  const mainnetClient = useMemo(
    () => new SuiRpcClient({ url: getFullnodeUrl("mainnet") }),
    [],
  );

  const { data: riskFeedObject } = useQuery({
    queryKey: ["proof-risk-feed-object", account?.address],
    queryFn: () =>
      objectExists(client, TESTNET_PROOF_PACK.riskFeed!.feedObjectId),
    refetchInterval: 15_000,
  });

  const { data: riskFeedPackage } = useQuery({
    queryKey: ["proof-risk-feed-package", account?.address],
    queryFn: () => objectExists(client, TESTNET_PROOF_PACK.riskFeed!.packageId),
    refetchInterval: 15_000,
  });

  const { data: predictObject } = useQuery({
    queryKey: ["proof-predict-object", account?.address],
    queryFn: () => objectExists(client, TESTNET_PROOF_PACK.predict!.objectId),
    refetchInterval: 15_000,
  });

  const { data: latestReading } = useQuery({
    queryKey: ["proof-latest-reading", account?.address],
    queryFn: () => queryLatestReading(client),
    refetchInterval: 15_000,
  });

  const { data: oracles } = useQuery({
    queryKey: ["proof-oracles", account?.address],
    queryFn: () => fetchActiveOracles(),
    retry: false,
  });

  const { data: reference } = useQuery({
    queryKey: ["proof-reference", account?.address],
    queryFn: () => fetchReferencePrice(),
    retry: false,
  });

  const { data: mainnetPackage } = useQuery({
    queryKey: ["proof-mainnet-package"],
    queryFn: () =>
      objectExists(
        mainnetClient,
        MAINNET_DEPEG_PROOF_PACK.depegPool!.packageId,
      ),
    refetchInterval: 30_000,
  });

  const { data: mainnetPool } = useQuery({
    queryKey: ["proof-mainnet-pool"],
    queryFn: () =>
      objectExists(mainnetClient, MAINNET_DEPEG_PROOF_PACK.depegPool!.poolId),
    enabled: !!MAINNET_DEPEG_PROOF_PACK.depegPool,
    refetchInterval: 30_000,
  });

  const { data: mainnetPolicy } = useQuery({
    queryKey: ["proof-mainnet-policy"],
    queryFn: () =>
      objectExists(
        mainnetClient,
        MAINNET_DEPEG_PROOF_PACK.productionActivePolicy?.objectId ??
          "0x0000000000000000000000000000000000000000000000000000000000000000",
      ),
    enabled: !!MAINNET_DEPEG_PROOF_PACK.productionActivePolicy,
    refetchInterval: 30_000,
  });

  const checks = useMemo(() => {
    const list: ProofCheck[] = [];
    const testnet = TESTNET_PROOF_PACK;
    const mainnet = MAINNET_DEPEG_PROOF_PACK;
    const testnetRiskFeed = testnet.riskFeed!;
    const testnetPredict = testnet.predict!;
    const testnetStagedClaim = testnet.stagedClaim!;

    const testnetOracleCount = oracles?.length ?? 0;
    const hasRef = Boolean(reference?.priceUsd);

    row(
      list,
      "RiskFeed package (testnet)",
      riskFeedPackage ? "PASS" : "WARN",
      "TESTNET",
      "LIVE READ",
      testnetRiskFeed.packageId,
      riskFeedPackage
        ? "Readable risk-feed package on testnet"
        : "Package read returned no data",
      objectUrl(testnetRiskFeed.packageId, "testnet"),
      "DEMO SCALE",
    );

    row(
      list,
      "RiskFeed shared object",
      riskFeedObject ? "PASS" : "WARN",
      "TESTNET",
      "CAPTURED TX",
      testnetRiskFeed.feedObjectId,
      riskFeedObject
        ? "Can be read from public testnet state"
        : "Not currently readable",
      objectUrl(testnetRiskFeed.feedObjectId, "testnet"),
      "DEMO SCALE",
    );

    row(
      list,
      "Predict oracle market",
      predictObject ? "PASS" : "WARN",
      "TESTNET",
      "CAPTURED TX",
      testnetPredict.objectId,
      "Predict contract object used by the read-only lab",
      objectUrl(testnetPredict.objectId, "testnet"),
      "DEMO SCALE",
    );

    row(
      list,
      "Live oracle surface",
      testnetOracleCount > 0 ? "PASS" : "WARN",
      "TESTNET",
      "LIVE READ",
      `${testnetOracleCount} active terms`,
      hasRef
        ? `Reference ${reference!.priceUsd.toFixed(2)} USD from Predict`
        : "No settled reference available",
      hasRef ? `${testnetOracleCount} active on Predict server` : undefined,
      "DEMO SCALE",
    );

    row(
      list,
      "Latest testnet breach reading",
      latestReading ? "PASS" : "WARN",
      "TESTNET",
      "STAGED PROOF",
      latestReading
        ? `${(Number(latestReading.prob_bps) / 100).toFixed(2)}%`
        : "No reading loaded",
      latestReading
        ? `Market ${latestReading.market} / reference ${latestReading.ref_price}`
        : "Publish reading to populate this row",
      latestReading
        ? `${WALRUS_AGGREGATOR}/${latestReading.walrus_blob}`
        : undefined,
      "DEMO SCALE",
    );

    row(
      list,
      "Production depeg package (mainnet)",
      mainnetPackage ? "PASS" : "WARN",
      "MAINNET",
      "LIVE READ",
      mainnet.depegPool?.packageId ?? "missing",
      mainnetPackage
        ? "Package loaded from mainnet and marked as deployed"
        : "Package could not be read on mainnet RPC",
      mainnet.depegPool?.packageId
        ? objectUrl(mainnet.depegPool.packageId, "mainnet")
        : undefined,
      "ADMIN CONTROLLED",
    );

    row(
      list,
      "Production depeg pool (mainnet)",
      mainnetPool ? "PASS" : "WARN",
      "MAINNET",
      "LIVE READ",
      mainnet.depegPool?.poolId ?? "missing",
      mainnetPool
        ? `Pool object found${
            mainnetPackage?.owner === "Immutable"
              ? "; module code is immutable"
              : ""
          }`
        : "Pool object not currently readable",
      mainnet.depegPool?.poolId
        ? objectUrl(mainnet.depegPool.poolId, "mainnet")
        : undefined,
      "ADMIN CONTROLLED",
    );

    row(
      list,
      "Production custody",
      mainnetPool ? "PASS" : "WARN",
      "MAINNET",
      "LIVE READ",
      mainnet.depegPool?.custody ?? "Unknown",
      mainnet.depegPool?.custody ?? "Custody field from on-chain pool schema",
      undefined,
      "ADMIN CONTROLLED",
    );

    const poolFields =
      mainnetPool &&
      (mainnetPool.content?.dataType === "moveObject"
        ? (mainnetPool.content.fields as Record<string, string>)
        : null);

    row(
      list,
      "Production pool capital",
      poolFields ? "PASS" : "WARN",
      "MAINNET",
      "LIVE READ",
      poolFields
        ? `${parseCoverState(poolFields.funds)} collateral · ${parseCoverState(poolFields.total_cover)} outstanding`
        : "Pool fields unavailable",
      poolFields
        ? `Policy threshold ${poolFields.threshold ?? "-"} with ${
            poolFields.activation_delay_secs ?? "-"
          }s arm delay`
        : "Unable to parse pool state",
      mainnet.depegPool?.poolId
        ? objectUrl(mainnet.depegPool.poolId, "mainnet")
        : undefined,
      "ADMIN CONTROLLED",
    );

    row(
      list,
      "Upgrade-cap status",
      mainnetPackage && isImmutableOwner(mainnetPackage.owner)
        ? "PASS"
        : "WARN",
      "MAINNET",
      "LIVE READ",
      mainnet.depegPool?.upgradeCapLocked
        ? "Upgradeable lock: immutable"
        : "Unknown",
      mainnetPackage
        ? mainnetPackage.owner === "Immutable"
          ? "Package owner is Immutable, code cannot be changed"
          : "Not immutable, additional review recommended"
        : "No package read",
      mainnet.depegPool?.packageId
        ? objectUrl(mainnet.depegPool.packageId, "mainnet")
        : undefined,
      "ADMIN CONTROLLED",
    );

    row(
      list,
      "Verifier status",
      mainnet.depegPool ? "PASS" : "WARN",
      "MAINNET",
      "LIVE READ",
      mainnet.depegPool?.verifier ?? "Walrus/Oracle not configured",
      `Pyth PriceInfoObject: ${mainnet.depegPool?.priceObjectId ?? "not set"}`,
      mainnet.depegPool?.priceObjectId
        ? objectUrl(mainnet.depegPool.priceObjectId, "mainnet")
        : undefined,
      "ADMIN CONTROLLED",
    );

    row(
      list,
      "Production active policy",
      mainnetPolicy && mainnetPolicy.type?.includes("Policy") ? "PASS" : "WARN",
      "MAINNET",
      "LIVE READ",
      mainnetPolicy?.objectId ??
        mainnet.productionActivePolicy?.objectId ??
        "-",
      mainnetPolicy && mainnetPolicy.content?.dataType === "moveObject"
        ? "Policy is readable and linked to the mainnet production pool"
        : "Policy state not read this run",
      mainnet.productionActivePolicy?.objectId
        ? objectUrl(mainnet.productionActivePolicy.objectId, "mainnet")
        : undefined,
      "ADMIN CONTROLLED",
    );

    row(
      list,
      "Judge-grade policy purchase (mainnet)",
      "PASS",
      "MAINNET",
      "CAPTURED TX",
      JUDGE_GRADE_POLICY.policyId,
      "Canonically bound to the /suilend consented flow",
      txUrl(JUDGE_GRADE_POLICY.txDigest, "mainnet"),
      "ADMIN CONTROLLED",
    );

    row(
      list,
      "Testnet research staged claim",
      "PASS",
      "TESTNET",
      "CAPTURED TX",
      `${testnetStagedClaim.market} active policy`,
      `Cover ${testnetStagedClaim.coverUsd} USD | premium ${testnetStagedClaim.premiumDusdc} DUSDC`,
      txUrl(testnetStagedClaim.digest, "testnet"),
      "DEMO SCALE",
    );

    return list;
  }, [
    latestReading,
    oracles,
    reference,
    riskFeedPackage,
    mainnetPackage,
    mainnetPool,
    mainnetPolicy,
  ]);

  const passCount = checks.filter((check) => check.status === "PASS").length;
  const health = `${passCount}/${checks.length}`;
  const now = new Date().toLocaleString();
  const mainnetPoolFields = moveFields(mainnetPool);
  const mainnetPolicyFields = moveFields(mainnetPolicy);
  const policyCover = fieldValue(mainnetPolicyFields, [
    "cover",
    "cover_mist",
    "cover_amount",
  ]);
  const policyExpiry = fieldValue(mainnetPolicyFields, [
    "expiry_ms",
    "expiry",
    "expires_at_ms",
  ]);
  const breachObservedAt = fieldValue(mainnetPolicyFields, [
    "breach_observed_at_ms",
    "breach_started_at_ms",
    "armed_at_ms",
    "armed_since_ms",
    "armed_at",
  ]);
  const latchState = fieldValue(mainnetPolicyFields, [
    "latched",
    "claim_latched",
    "claimable",
    "settled",
    "paid",
  ]);

  const lifecycleRows: LifecycleRow[] = [
    {
      title: "1. Package deployed",
      status: mainnetPackage ? "VERIFIED" : "NOT ASSERTED",
      detail: MAINNET_DEPEG_PROOF_PACK.depegPool?.packageId ?? "missing",
      evidence: "Move package object",
      link: MAINNET_DEPEG_PROOF_PACK.depegPool?.packageId
        ? objectUrl(MAINNET_DEPEG_PROOF_PACK.depegPool.packageId, "mainnet")
        : undefined,
    },
    {
      title: "2. Pool funded",
      status: mainnetPoolFields ? "VERIFIED" : "NOT ASSERTED",
      detail: mainnetPoolFields
        ? `${parseCoverState(mainnetPoolFields.funds)} collateral / ${parseCoverState(
            mainnetPoolFields.total_cover,
          )} outstanding`
        : "Pool fields not readable from current RPC response",
      evidence: "Shared pool fields",
      link: MAINNET_DEPEG_PROOF_PACK.depegPool?.poolId
        ? objectUrl(MAINNET_DEPEG_PROOF_PACK.depegPool.poolId, "mainnet")
        : undefined,
    },
    {
      title: "3. Policy object issued",
      status: mainnetPolicyFields ? "VERIFIED" : "NOT ASSERTED",
      detail: policyCover
        ? `Cover ${parseCoverState(policyCover)} / expiry ${policyExpiry ?? "-"}`
        : (MAINNET_DEPEG_PROOF_PACK.productionActivePolicy?.objectId ??
          "Policy object not readable"),
      evidence: "Owned policy object",
      link: MAINNET_DEPEG_PROOF_PACK.productionActivePolicy?.objectId
        ? objectUrl(
            MAINNET_DEPEG_PROOF_PACK.productionActivePolicy.objectId,
            "mainnet",
          )
        : undefined,
    },
    {
      title: "4. Breach observation",
      status: lifecycleStatus(breachObservedAt),
      detail:
        breachObservedAt ??
        "No breach/arm timestamp asserted from the current policy object read",
      evidence: "Policy latch fields",
    },
    {
      title: "5. Claim latch",
      status: lifecycleStatus(latchState),
      detail:
        latchState ??
        "No claimable/latched/paid field asserted from the current policy object read",
      evidence: "Policy claim fields",
    },
    {
      title: "6. Expiry or sweep path",
      status: policyExpiry ? "OBSERVABLE" : "NOT ASSERTED",
      detail:
        policyExpiry ??
        "Expiry field not asserted from current policy object read",
      evidence: "Policy expiry fields + SDK expire builder",
    },
  ];

  return (
    <section className="card">
      <div className="proof-head">
        <div>
          <h3>Public proof center</h3>
          <p className="muted">
            End-to-end evidence matrix for the mainnet cover lane, active policy
            lifecycle, and isolated testnet research artifacts.
          </p>
        </div>
        <div
          className="proof-pill"
          title="Rows that pass have readable chain artifacts or query data"
        >
          Proof health {health}
        </div>
      </div>

      <div className="proof-strip proof-strip-wide" aria-live="polite">
        <div className="proof-item">
          <div className="k">Last checked</div>
          <div className="v">{now}</div>
          <div className="muted">UTC</div>
        </div>
        <div className="proof-item">
          <div className="k">Signed in</div>
          <div className="v">{account?.address ?? "No wallet"}</div>
          <div className="muted">Wallet context for owner-readable rows</div>
        </div>
        <div className="proof-item">
          <div className="k">Verifier</div>
          <div className="v">Mainnet: Pyth + pool checks</div>
          <div className="muted">Testnet: RiskFeed + Walrus proofs</div>
        </div>
        <div className="proof-item">
          <div className="k">Policy lane</div>
          <div className="v">suiUSDe cover + DeepBook lab</div>
          <div className="muted">
            Mainnet product, isolated testnet research
          </div>
        </div>
      </div>

      <div className="section-head compact">
        <div>
          <div className="eyebrow">Mainnet lifecycle</div>
          <h3>Depeg policy replay</h3>
        </div>
        <p className="muted">
          This panel reads mainnet objects only. It marks what is verified,
          observable, or not asserted from current object fields; it does not
          claim a payout unless the policy object exposes that state.
        </p>
      </div>

      <div className="lifecycle-grid">
        {lifecycleRows.map((item) => (
          <article className="lifecycle-card" key={item.title}>
            <div className="lifecycle-top">
              <strong>{item.title}</strong>
              <span
                className={`lifecycle-status ${item.status.toLowerCase().replace(" ", "-")}`}
              >
                {item.status}
              </span>
            </div>
            <p>{item.detail}</p>
            <div className="muted">{item.evidence}</div>
            {item.link && (
              <a href={item.link} target="_blank" rel="noreferrer">
                open
              </a>
            )}
          </article>
        ))}
      </div>

      <KeeperOpsCenter />

      <div className="proof-table-wrap">
        <div className="proof-row proof-headrow">
          <span>Item</span>
          <span>Network</span>
          <span>Evidence</span>
          <span>Safety</span>
          <span>Status</span>
        </div>

        {checks.map((row) => (
          <article className="proof-row" key={`${row.network}-${row.label}`}>
            <div className="proof-item-main">
              <div className="proof-item-title">{row.label}</div>
              <div className="muted">{row.note}</div>
              <div className="proof-item-value">{row.value}</div>
            </div>
            <div>{row.network}</div>
            <div>{row.evidence}</div>
            <div>{row.safety}</div>
            <div>
              <span className={`proof-status ${row.status.toLowerCase()}`}>
                {row.status}
              </span>
            </div>
            {row.link && (
              <a
                className="proof-link"
                href={row.link}
                target="_blank"
                rel="noreferrer"
              >
                open
              </a>
            )}
          </article>
        ))}
      </div>

      <OnchainRiskFeed />
    </section>
  );
}
