import { useMemo } from "react";
import { SuiClient as SuiRpcClient, getFullnodeUrl } from "@mysten/sui/client";
import { useQuery } from "@tanstack/react-query";
import { readDepegPool, readDepegPrice } from "@gudman/backstop-sdk";
import { objectUrl, txUrl } from "../lib/format";
import { MAINNET_DEPEG_PROOF_PACK } from "../lib/proofData";
import { KEEPER_OPERATIONS, keeperStatusLabel } from "../lib/riskClearinghouse";

type ObjectData = Awaited<ReturnType<typeof fetchObject>>;

const MIST_PER_SUI = 1_000_000_000;

async function fetchObject(client: SuiRpcClient, objectId: string) {
  const object = await client.getObject({
    id: objectId,
    options: { showContent: true, showOwner: true, showType: true },
  });
  return object.data ?? null;
}

function moveFields(object: ObjectData) {
  return object?.content?.dataType === "moveObject"
    ? (object.content.fields as Record<string, unknown>)
    : null;
}

function fieldValue(fields: Record<string, unknown> | null, names: string[]) {
  if (!fields) return null;
  for (const name of names) {
    const value = fields[name];
    if (value !== undefined && value !== null) return String(value);
  }
  return null;
}

function numberField(value: string | null) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function boolField(value: string | null) {
  if (!value) return false;
  return value === "true" || value === "1";
}

function mistToSui(value: bigint) {
  return Number(value) / MIST_PER_SUI;
}

function actionStatusClass(status: string) {
  return status.toLowerCase().replaceAll(" ", "-");
}

type KeeperReceipt = {
  ts: string;
  mode: "execute" | "dry-run";
  packageId: string;
  poolId: string;
  price: {
    priceUsd: number;
    adversePriceUsd: number;
    thresholdUsd: number;
    triggered: boolean;
    publishMs?: number | null;
  };
  pool: {
    fundsSui: number;
    totalCoverSui: number;
    keeperBountySui: number;
    paused: boolean;
  };
  policies: Array<{
    policyId: string;
    exists: boolean;
    type: string | null;
    action: string;
    executable: boolean;
    reason: string;
    builder: string | null;
    execution?: {
      digest: string;
      status: string;
    } | null;
  }>;
};

export default function KeeperOpsCenter() {
  const depeg = MAINNET_DEPEG_PROOF_PACK.depegPool!;
  const policies =
    MAINNET_DEPEG_PROOF_PACK.keeperPolicies ??
    (MAINNET_DEPEG_PROOF_PACK.productionActivePolicy
      ? [
          {
            label: "Production active policy",
            objectId: MAINNET_DEPEG_PROOF_PACK.productionActivePolicy.objectId,
            status: MAINNET_DEPEG_PROOF_PACK.productionActivePolicy.status,
          },
        ]
      : []);
  const client = useMemo(
    () => new SuiRpcClient({ url: getFullnodeUrl("mainnet") }),
    [],
  );

  const { data: pool } = useQuery({
    queryKey: ["keeper-mainnet-depeg-pool", depeg.poolId],
    queryFn: () => readDepegPool(client, depeg.poolId),
    refetchInterval: 15_000,
  });

  const { data: price } = useQuery({
    queryKey: ["keeper-mainnet-depeg-price", depeg.priceObjectId],
    queryFn: () =>
      readDepegPrice(client, {
        priceObject: depeg.priceObjectId,
        thresholdUsd: 0.985,
      }),
    retry: false,
    refetchInterval: 15_000,
  });

  const policyQueries = useQuery({
    queryKey: [
      "keeper-mainnet-policies",
      policies.map((policy) => policy.objectId).join(":"),
    ],
    queryFn: async () =>
      Promise.all(
        policies.map(async (policy) => ({
          ...policy,
          object: await fetchObject(client, policy.objectId),
        })),
      ),
    enabled: policies.length > 0,
    refetchInterval: 15_000,
  });

  const policyActions = useMemo(() => {
    const nowMs = Date.now();
    return (policyQueries.data ?? []).map((policy) => {
      const fields = moveFields(policy.object);
      const cover = fieldValue(fields, ["cover", "cover_mist", "cover_amount"]);
      const expiry = numberField(
        fieldValue(fields, ["expiry_ms", "expiry", "expires_at_ms"]),
      );
      const breachObservedAt = fieldValue(fields, [
        "breach_observed_at_ms",
        "breach_started_at_ms",
        "armed_at_ms",
        "armed_since_ms",
        "armed_at",
      ]);
      const latched = boolField(
        fieldValue(fields, [
          "latched",
          "claim_latched",
          "claimable",
          "settled",
          "paid",
        ]),
      );
      const expired = expiry !== null && nowMs > expiry;
      const triggered = Boolean(price?.triggered);
      const detail = cover
        ? `${(Number(cover) / MIST_PER_SUI).toFixed(6)} SUI cover`
        : "Cover field not asserted";

      if (latched) {
        return {
          ...policy,
          detail,
          next: "Claim latched policy",
          status: "READY",
          proof: "buildDepegClaimLatchedTx",
        };
      }

      if (expired) {
        return {
          ...policy,
          detail,
          next: "Expire unlatched policy",
          status: "READY",
          proof: "buildDepegExpirePolicyByIdTx",
        };
      }

      if (triggered) {
        return {
          ...policy,
          detail,
          next: breachObservedAt
            ? "Confirm sustained breach after dwell"
            : "Record first breach observation",
          status: "WATCH",
          proof: "buildDepegRecordBreachTx",
        };
      }

      return {
        ...policy,
        detail,
        next: "Monitor price and policy state",
        status: "OBSERVE",
        proof: "No transaction needed",
      };
    });
  }, [policyQueries.data, price?.triggered]);

  const utilization =
    pool && pool.fundsMist > 0n
      ? Math.min(
          100,
          (Number(pool.totalCoverMist) / Number(pool.fundsMist)) * 100,
        )
      : 0;

  const {
    data: keeperReport,
    isLoading: reportLoading,
    isError: reportError,
  } = useQuery({
    queryKey: ["keeper-lane-report"],
    queryFn: async () => {
      const response = await fetch("/api/keeper-operations.json", {
        cache: "no-store",
      });
      if (!response.ok) return null;
      return (await response.json()) as KeeperReceipt;
    },
    refetchInterval: 45_000,
  });

  const readableRunMode =
    keeperReport?.mode === "execute" ? "SIGNED" : "DRY RUN";

  return (
    <section className="keeper-ops">
      <div className="section-head compact">
        <div>
          <div className="eyebrow">Keeper operations</div>
          <h3>Public dry-run monitor</h3>
        </div>
        <p className="muted">
          This panel reads mainnet pool, price, and policy objects. It derives
          likely keeper actions, but never signs or claims a keeper has already
          run unless a transaction digest is present.
        </p>
      </div>

      <div className="proof-strip proof-strip-wide" aria-live="polite">
        <div className="proof-item">
          <div className="k">Pyth price</div>
          <div className="v">
            {price ? `$${price.priceUsd.toFixed(4)}` : "Loading"}
          </div>
          <div className="muted">
            Triggered: {price?.triggered ? "yes" : "no"}
          </div>
        </div>
        <div className="proof-item">
          <div className="k">Keeper bounty</div>
          <div className="v">
            {pool
              ? `${mistToSui(pool.keeperBountyMist).toFixed(6)} SUI`
              : "Loading"}
          </div>
          <div className="muted">Pool-configured reward field</div>
        </div>
        <div className="proof-item">
          <div className="k">Pool utilization</div>
          <div className="v">
            {pool ? `${utilization.toFixed(1)}%` : "Loading"}
          </div>
          <div className="muted">
            {pool
              ? `${mistToSui(pool.totalCoverMist).toFixed(4)} SUI cover`
              : "Pool state pending"}
          </div>
        </div>
      </div>

      <div className="ops-grid">
        {KEEPER_OPERATIONS.map((operation) => (
          <article className="ops-card" key={operation.id}>
            <div className="market-top">
              <span className={`ops-status ${operation.status}`}>
                {keeperStatusLabel(operation.status)}
              </span>
              <strong>{operation.cadence}</strong>
            </div>
            <h3>{operation.lane}</h3>
            <p className="muted">{operation.action}</p>
            <div className="passport-detail">
              <b>Proof</b>
              <em>{operation.proof}</em>
            </div>
          </article>
        ))}
      </div>

      <div className="proof-table-wrap">
        <div className="proof-row proof-headrow keeper-row">
          <span>Policy</span>
          <span>State</span>
          <span>Next keeper action</span>
          <span>Builder</span>
          <span>Status</span>
        </div>
        {policyActions.map((policy) => (
          <article className="proof-row keeper-row" key={policy.objectId}>
            <div className="proof-item-main">
              <div className="proof-item-title">{policy.label}</div>
              <div className="muted">{policy.objectId}</div>
              <a
                className="proof-link"
                href={objectUrl(policy.objectId, "mainnet")}
                target="_blank"
                rel="noreferrer"
              >
                open object
              </a>
            </div>
            <div>{policy.detail}</div>
            <div>{policy.next}</div>
            <div>{policy.proof}</div>
            <div>
              <span
                className={`proof-status ${actionStatusClass(policy.status)}`}
              >
                {policy.status}
              </span>
            </div>
          </article>
        ))}
      </div>

      <p className="note">
        Execution boundary: public monitoring is live. Breach recording, claim,
        and expiry sweep still require a funded signer, wallet approval, and the
        SDK PTB builders shown above.
      </p>

      <div className="section-head compact">
        <div>
          <div className="eyebrow">Keeper receipts</div>
          <h3>Signed action lane (if run enabled)</h3>
        </div>
        <p className="muted">
          Run `npm run keeper:depeg:publish` from `app/` to write the current
          keeper lane snapshot here.
        </p>
      </div>

      {reportLoading && <p className="muted">Loading keeper run snapshot...</p>}

      {reportError && (
        <p className="note err">
          Keeper snapshot unavailable. Run `npm run keeper:depeg:publish` to
          generate one.
        </p>
      )}

      {!keeperReport && !reportLoading && !reportError && (
        <p className="note">No keeper snapshot available yet.</p>
      )}

      {keeperReport && (
        <div className="proof-table-wrap">
          <div className="proof-row proof-headrow">
            <span>Field</span>
            <span>Value</span>
            <span>Status</span>
            <span>Run mode</span>
            <span>Price</span>
            <span></span>
          </div>
          <article className="proof-row">
            <div className="proof-item-main">
              <div className="proof-item-title">Last checked</div>
            </div>
            <div>{new Date(keeperReport.ts).toLocaleString()}</div>
            <div>
              <span className="proof-status pass">Live</span>
            </div>
            <div>{readableRunMode}</div>
            <div>{keeperReport.price.triggered ? "Triggered" : "Observing"}</div>
            <div />
          </article>
          <article className="proof-row">
            <div className="proof-item-main">
              <div className="proof-item-title">Pool capital / util</div>
            </div>
            <div>{`${keeperReport.pool.fundsSui.toFixed(4)} / ${Math.min(
              100,
              (keeperReport.pool.totalCoverSui / keeperReport.pool.fundsSui) * 100,
            ).toFixed(1)}%`}</div>
            <div>
              <span
                className={keeperReport.pool.paused ? "proof-status warn" : "proof-status pass"}
              >
                {keeperReport.pool.paused ? "PAUSED" : "ACTIVE"}
              </span>
            </div>
            <div>{keeperReport.mode}</div>
            <div>${keeperReport.price.priceUsd.toFixed(4)}</div>
            <div />
          </article>
          {keeperReport.policies.map((policy) => (
            <article className="proof-row keeper-row" key={policy.policyId}>
              <div className="proof-item-main">
                <div className="proof-item-title">
                  {policy.exists ? "Policy action" : "Policy missing"}
                </div>
                <div className="muted">{policy.policyId}</div>
                <a
                  className="proof-link"
                  href={objectUrl(policy.policyId, "mainnet")}
                  target="_blank"
                  rel="noreferrer"
                >
                  open object
                </a>
              </div>
              <div>{policy.reason}</div>
              <div>
                <span className={`proof-status ${policy.executable ? "pass" : "watch"}`}>
                  {policy.executable ? "EXECUTABLE" : "OBSERVE"}
                </span>
              </div>
              <div>{readableRunMode}</div>
              <div>{policy.action}</div>
              <div>
                {policy.execution ? (
                  <a
                    className="proof-link"
                    href={txUrl(policy.execution.digest, "mainnet")}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {policy.execution.status}
                  </a>
                ) : (
                  "pending"
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
