import { MAINNET_DEPEG_PROOF_PACK } from "../lib/proofData";
import {
  PROTOCOL_ADAPTERS,
  PROTOCOL_PASSPORTS,
} from "../lib/riskClearinghouse";

export default function ProtocolKit() {
  const depeg = MAINNET_DEPEG_PROOF_PACK.depegPool!;

  return (
    <section className="card">
      <h3>Protocol integration kit</h3>
      <p className="muted">
        Backstop should feel like Stripe for Sui risk: protocols quote cover,
        create policies, monitor breach conditions, settle valid claims, and
        export evidence without building their own insurance stack.
      </p>

      <div className="integration-grid">
        <article>
          <span>Mode 1</span>
          <h4>Wallet quote widget</h4>
          <p>
            Show covered/uncovered state beside a wallet holding or lending
            position and route the user to a policy quote.
          </p>
        </article>
        <article>
          <span>Mode 2</span>
          <h4>Protocol adapter</h4>
          <p>
            A protocol service reads exposures, buys policies for user buckets,
            and stores policy IDs against account objects.
          </p>
        </article>
        <article>
          <span>Mode 3</span>
          <h4>Risk passport</h4>
          <p>
            A public proof page explains risk, limits, keepers, and claim rules
            before users supply liquidity.
          </p>
        </article>
      </div>

      <div className="passport-grid">
        {PROTOCOL_PASSPORTS.map((passport) => (
          <article className="passport-card" key={passport.protocol}>
            <span>{passport.readiness.replace("-", " ")}</span>
            <h3>{passport.protocol}</h3>
            <strong>{passport.lane}</strong>
            <p className="muted">{passport.integration}</p>
            <div className="passport-detail">
              <b>Exposure</b>
              <em>{passport.coveredExposure}</em>
            </div>
            <div className="passport-detail">
              <b>Trigger</b>
              <em>{passport.trigger}</em>
            </div>
            <div className="passport-detail">
              <b>Partner ask</b>
              <em>{passport.partnerAsk}</em>
            </div>
          </article>
        ))}
      </div>

      <div className="section-head compact">
        <div>
          <div className="eyebrow">Adapter contract</div>
          <h3>NAVI and Suilend evidence boundary</h3>
        </div>
        <p className="muted">
          Backstop does not need protocol custody. It needs read-only evidence,
          user or protocol consent, and a stable policy-binding table.
        </p>
      </div>

      <div className="adapter-grid">
        {PROTOCOL_ADAPTERS.map((adapter) => (
          <article className="adapter-card" key={adapter.protocol}>
            <span>{adapter.protocol}</span>
            <h3>{adapter.adapterEntry}</h3>
            <p className="muted">{adapter.sourceVerified}</p>
            <div className="passport-detail">
              <b>Cover decision</b>
              <em>{adapter.coverDecision}</em>
            </div>
            <div className="passport-detail">
              <b>Policy binding</b>
              <em>{adapter.policyBinding}</em>
            </div>
            <div className="adapter-list">
              {adapter.reads.map((read) => (
                <em key={read}>{read}</em>
              ))}
            </div>
          </article>
        ))}
      </div>

      <article className="proof-card">
        <h4>1) Quote depeg cover from a protocol service</h4>
        <pre>
          {`import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { quoteDepegPremium, readDepegPool } from "@gudman/backstop-sdk";

const PYTH_DEPEG_POOL = "${depeg.poolId}";

const client = new SuiClient({ url: getFullnodeUrl("mainnet") });
const pool = await readDepegPool(client, PYTH_DEPEG_POOL);

const coverMist = 50_000_000n; // 0.05 SUI cover
const termDays = 30;
const premiumMist = quoteDepegPremium(pool, coverMist, termDays);
console.log("premium SUI", Number(premiumMist) / 1_000_000_000);`}
        </pre>
      </article>

      <article className="proof-card">
        <h4>2) Buy cover for a managed protocol position</h4>
        <pre>
          {`import { buildDepegBuyCoverTx } from "@gudman/backstop-sdk";

const PYTH_DEPEG_COVER_PKG = "${depeg.packageId}";
const PYTH_DEPEG_POOL = "${depeg.poolId}";
const expiryMs = BigInt(Date.now() + termDays * 86_400_000 - 60_000);

const tx = buildDepegBuyCoverTx({
  pkg: PYTH_DEPEG_COVER_PKG,
  poolId: PYTH_DEPEG_POOL,
  premiumMist,
  coverMist,
  expiryMs,
  owner,
});

const result = await signer.signAndExecuteTransaction({ transaction: tx });
const { digest } = result;`}
        </pre>
      </article>

      <article className="proof-card">
        <h4>3) Record breach signal after protocol checks</h4>
        <pre>
          {`import { buildDepegRecordBreachTx } from "@gudman/backstop-sdk";

const recordTx = await buildDepegRecordBreachTx({
  client,
  pkg: PYTH_DEPEG_COVER_PKG,
  poolId: PYTH_DEPEG_POOL,
  policyId,
});

await signer.signAndExecuteTransaction({ transaction: recordTx });`}
        </pre>
      </article>

      <article className="proof-card">
        <h4>4) Claim latched policy</h4>
        <pre>
          {`import { buildDepegClaimLatchedTx } from "@gudman/backstop-sdk";

const claimTx = buildDepegClaimLatchedTx({
  pkg: PYTH_DEPEG_COVER_PKG,
  poolId: PYTH_DEPEG_POOL,
  policyId,
  owner,
});

const { digest } = await signer.signAndExecuteTransaction({
  transaction: claimTx,
});`}
        </pre>
      </article>

      <article className="proof-card">
        <h4>5) NAVI/Suilend adapter pattern</h4>
        <pre>
          {`type ProtocolExposure = {
  protocol: "NAVI" | "Suilend";
  account: string;
  positionId: string;
  assetType: string;
  coverMist: bigint;
  riskBudgetMist: bigint;
  evidence: {
    lendingMarketId?: string;
    obligationId?: string;
    reserveType?: string;
    source: "sdk" | "object";
  };
};

const exposures: ProtocolExposure[] =
  await adapter.readCoveredExposures(owner);

for (const exposure of exposures) {
  if (exposure.coverMist === 0n) continue;

  const premiumMist = quoteDepegPremium(
    pool,
    exposure.coverMist,
    termDays,
  );

  if (premiumMist > exposure.riskBudgetMist) continue;

  const tx = buildDepegBuyCoverTx({
    pkg: PYTH_DEPEG_COVER_PKG,
    poolId: PYTH_DEPEG_POOL,
    premiumMist,
    coverMist: exposure.coverMist,
    expiryMs,
    owner: exposure.account,
  });

  const { policyId } = await submitAndIndexPolicy(tx);
  await policyStore.insert({
    protocol: exposure.protocol,
    account: exposure.account,
    positionId: exposure.positionId,
    policyId,
    assetType: exposure.assetType,
    evidence: exposure.evidence,
  });
}`}
        </pre>
      </article>

      <article className="proof-card">
        <h4>6) Public proof API shape</h4>
        <pre>
          {`// Static artifacts available after build:
// GET /api/proof.json
// GET /api/risk-index.json

type BackstopProof = {
  primaryTrack: "DeepBook";
  network: "sui:mainnet";
  product: "suiUSDe depeg cover";
  packageId: string;
  poolId: string;
  activePolicyId: string;
  sdk: "@gudman/backstop-sdk";
  proofPages: string[];
};`}
        </pre>
      </article>

      <p className="note">
        Always keep protocol governance in control. Backstop handles cover
        policy mechanics and proof surfaces; each protocol should keep its own
        risk caps, user consent, and incident governance.
      </p>
    </section>
  );
}
