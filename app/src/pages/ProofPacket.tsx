import { useQuery } from "@tanstack/react-query";
import { fetchProofHealth } from "../lib/proofHealth";
import {
  PYTH_ADMIN_CUSTODY_OWNER,
  PYTH_ADMIN_CUSTODY_TX,
  PYTH_COVER_UPGRADE_CAP,
  PYTH_COVER_UPGRADE_LOCK_TX,
  PYTH_DEPEG_COVER_PKG,
  PYTH_DEPEG_POOL,
  PYTH_LENDING_MARKET,
  PYTH_LENDING_PKG,
  PYTH_LENDING_UPGRADE_CAP,
  PYTH_PRODUCTION_INSURE_TX,
  PYTH_STAGED_CLAIM_TX,
  PYTH_STAGED_LENDING_MARKET,
  PYTH_STAGED_POOL,
} from "../lib/deployment";
import { sui } from "../lib/format";
import "../components/terminal.css";

const SUIVISION = "https://suivision.xyz";

const short = (id: string) => `${id.slice(0, 10)}...${id.slice(-6)}`;
const objectUrl = (id: string) => `${SUIVISION}/object/${id}`;
const txUrl = (digest: string) => `${SUIVISION}/txblock/${digest}`;

const updated = (ms?: number) =>
  ms
    ? new Date(ms).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
      })
    : "-";

const proofObjects = [
  {
    label: "Cover package",
    value: PYTH_DEPEG_COVER_PKG,
    href: objectUrl(PYTH_DEPEG_COVER_PKG),
  },
  {
    label: "Production pool",
    value: PYTH_DEPEG_POOL,
    href: objectUrl(PYTH_DEPEG_POOL),
  },
  {
    label: "Production lending market",
    value: PYTH_LENDING_MARKET,
    href: objectUrl(PYTH_LENDING_MARKET),
  },
  {
    label: "Staged proof pool",
    value: PYTH_STAGED_POOL,
    href: objectUrl(PYTH_STAGED_POOL),
  },
  {
    label: "Staged proof market",
    value: PYTH_STAGED_LENDING_MARKET,
    href: objectUrl(PYTH_STAGED_LENDING_MARKET),
  },
  {
    label: "Lending package",
    value: PYTH_LENDING_PKG,
    href: objectUrl(PYTH_LENDING_PKG),
  },
  {
    label: "Cover UpgradeCap",
    value: PYTH_COVER_UPGRADE_CAP,
    href: objectUrl(PYTH_COVER_UPGRADE_CAP),
  },
  {
    label: "Lending UpgradeCap",
    value: PYTH_LENDING_UPGRADE_CAP,
    href: objectUrl(PYTH_LENDING_UPGRADE_CAP),
  },
];

const proofTxs = [
  {
    label: "Upgrade policy lock",
    value: PYTH_COVER_UPGRADE_LOCK_TX,
    detail: "cover + lending caps locked to dependency-only policy",
  },
  {
    label: "AdminCap custody",
    value: PYTH_ADMIN_CUSTODY_TX,
    detail: `owner ${short(PYTH_ADMIN_CUSTODY_OWNER)}`,
  },
  {
    label: "Production active cover",
    value: PYTH_PRODUCTION_INSURE_TX,
    detail: "production pool retained premium while suiUSDe stayed above floor",
  },
  {
    label: "Staged claim",
    value: PYTH_STAGED_CLAIM_TX,
    detail: "mechanism-test buy, dwell, confirm, and claim paid on mainnet",
  },
];

const snippets = [
  {
    title: "Quote cover",
    body: `import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import {
  PYTH_DEPEG_POOL,
  quoteDepegPremium,
  readDepegPool,
} from "@gudman/backstop-sdk";

const client = new SuiClient({ url: getFullnodeUrl("mainnet") });
const pool = await readDepegPool(client, PYTH_DEPEG_POOL);
const coverMist = 50_000_000n; // 0.05 SUI payout
const premiumMist = quoteDepegPremium(pool, coverMist, 30);

console.log({ premiumMist: premiumMist.toString() });`,
  },
  {
    title: "Buy cover for a position",
    body: `import { buildDepegBuyCoverTx, PYTH_DEPEG_COVER_PKG, PYTH_DEPEG_POOL } from "@gudman/backstop-sdk";

const expiryMs = BigInt(Date.now() + 30 * 86_400_000 - 60_000);
const tx = buildDepegBuyCoverTx({
  pkg: PYTH_DEPEG_COVER_PKG,
  poolId: PYTH_DEPEG_POOL,
  premiumMist,
  coverMist,
  expiryMs,
  owner: positionOwner,
});

await signAndExecute({ transaction: tx, chain: "sui:mainnet" });`,
  },
  {
    title: "Record breach",
    body: `import { buildDepegRecordBreachTx, PYTH_DEPEG_COVER_PKG, PYTH_DEPEG_POOL } from "@gudman/backstop-sdk";

const tx = await buildDepegRecordBreachTx({
  client,
  pkg: PYTH_DEPEG_COVER_PKG,
  poolId: PYTH_DEPEG_POOL,
  policyId,
});

await signAndExecute({ transaction: tx, chain: "sui:mainnet" });`,
  },
  {
    title: "Claim latched cover",
    body: `import { buildDepegClaimLatchedTx, PYTH_DEPEG_COVER_PKG, PYTH_DEPEG_POOL } from "@gudman/backstop-sdk";

const tx = buildDepegClaimLatchedTx({
  pkg: PYTH_DEPEG_COVER_PKG,
  poolId: PYTH_DEPEG_POOL,
  policyId,
  owner: payoutRecipient,
});

await signAndExecute({ transaction: tx, chain: "sui:mainnet" });`,
  },
];

export default function ProofPacket() {
  const { data, error, isLoading, isFetching } = useQuery({
    queryKey: ["proof-packet-health"],
    queryFn: fetchProofHealth,
    refetchInterval: 60_000,
  });
  const okCount =
    data?.checks.filter((item) => item.status === "ok").length ?? 0;
  const total = data?.checks.length ?? 0;
  const productionPool = data?.checks.find(
    (item) => item.label === "Production pool",
  );
  const productionCover = data?.checks.find(
    (item) => item.label === "Production cover",
  );

  return (
    <div className="proof-page">
      <section className="proof-hero">
        <div>
          <p className="proof-kicker">Mainnet proof packet</p>
          <h1>Every load-bearing claim in one place.</h1>
          <p>
            Package IDs, pool IDs, custody, upgrade policy, staged payout, and
            production active-cover evidence are read from Sui mainnet and
            linked to public explorers.
          </p>
        </div>
        <div className="proof-score-card">
          <span className={total > 0 && okCount === total ? "ok" : "warn"}>
            {okCount}/{total || "-"}
          </span>
          <small>
            {isFetching ? "refreshing" : `updated ${updated(data?.updatedAt)}`}
          </small>
        </div>
      </section>

      <section className="proof-grid-3">
        <div className="term-stat">
          <div className="k">Production pool</div>
          <div className="v">{productionPool?.value ?? "-"}</div>
          <p className="muted">
            {productionPool?.detail ?? "Reading mainnet..."}
          </p>
        </div>
        <div className="term-stat">
          <div className="k">Active cover</div>
          <div className="v">{productionCover?.value ?? "-"}</div>
          <p className="muted">
            {productionCover?.detail ?? "Production policy evidence"}
          </p>
        </div>
        <div className="term-stat">
          <div className="k">Custody owner</div>
          <div className="v mono">{short(PYTH_ADMIN_CUSTODY_OWNER)}</div>
          <p className="muted">AdminCaps transferred away from the deployer.</p>
        </div>
      </section>

      <section className="card proof-health-card">
        <div className="proof-health-head">
          <div>
            <h3>
              Verifier status <span className="sub">- live Sui reads</span>
            </h3>
            <p className="lead">
              This is the same health surface used by the `/depeg` cockpit,
              expanded here for review and integration diligence.
            </p>
          </div>
        </div>
        {isLoading && (
          <p className="muted">Reading Sui mainnet proof state...</p>
        )}
        {error && (
          <p className="note err">
            Proof read failed: {(error as Error).message}
          </p>
        )}
        {data && (
          <div className="proof-health-grid">
            {data.checks.map((item) => (
              <a
                className={`proof-health-row ${item.status}`}
                href={item.href}
                key={item.label}
                target="_blank"
                rel="noreferrer"
              >
                <span>
                  <strong>{item.label}</strong>
                  <span className="muted">{item.detail}</span>
                </span>
                <span className="proof-health-status">{item.value}</span>
              </a>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <h3>
          Object registry{" "}
          <span className="sub">- production and proof pools</span>
        </h3>
        <p className="lead">
          These are public object IDs, not secrets. They are split in source
          only to avoid private-key scanners flagging public 64-byte IDs.
        </p>
        <div className="proof-object-list">
          {proofObjects.map((item) => (
            <a
              href={item.href}
              key={item.label}
              target="_blank"
              rel="noreferrer"
            >
              <span>{item.label}</span>
              <code>{item.value}</code>
            </a>
          ))}
        </div>
      </section>

      <section className="card">
        <h3>
          Transaction evidence <span className="sub">- explorer linked</span>
        </h3>
        <div className="proof-tx-grid">
          {proofTxs.map((item) => (
            <a
              href={txUrl(item.value)}
              key={item.label}
              target="_blank"
              rel="noreferrer"
            >
              <strong>{item.label}</strong>
              <span className="muted">{item.detail}</span>
              <code>{item.value}</code>
            </a>
          ))}
        </div>
      </section>

      <section className="card">
        <h3>
          Protocol integration snippets{" "}
          <span className="sub">- SDK source is local until npm release</span>
        </h3>
        <p className="lead">
          The SDK builds locally today. Partner repos can vendor or
          workspace-link `sdk/`; npm publication remains an explicit release
          step.
        </p>
        <div className="proof-snippets">
          {snippets.map((snippet) => (
            <article key={snippet.title}>
              <h4>{snippet.title}</h4>
              <pre>
                <code>{snippet.body}</code>
              </pre>
            </article>
          ))}
        </div>
      </section>

      <section className="card">
        <h3>
          NAVI / Suilend integration shape{" "}
          <span className="sub">- position-native cover</span>
        </h3>
        <div className="proof-flow">
          {[
            [
              "Read exposure",
              "Parse wallet owner caps, obligations, and USDe-family supply/borrow lines.",
            ],
            [
              "Size cover",
              "Convert net stablecoin exposure to SUI payout using Pyth SUI/USD.",
            ],
            [
              "Buy policy",
              `Call the v2 production pool for ${sui(50_000_000n)}-style cover chunks or a capped position size.`,
            ],
            [
              "Maintain keeper",
              "Run record_breach during sustained depeg conditions, then claim once latched.",
            ],
          ].map(([title, body]) => (
            <div className="term-stat" key={title}>
              <div className="k">{title}</div>
              <p className="muted">{body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
