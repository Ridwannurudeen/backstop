import { objectUrl, txUrl } from "../lib/format";
import { MAINNET_DEPEG_PROOF_PACK, TESTNET_PROOF_PACK } from "../lib/proofData";
import {
  KEEPER_OPERATIONS,
  PROTOCOL_ADAPTERS,
  PROTOCOL_PASSPORTS,
  RISK_MARKETS,
  keeperStatusLabel,
  statusLabel,
} from "../lib/riskClearinghouse";

const MAINNET_JUDGE_GRADE_PURCHASE_TX =
  "5AGzShNPABk9RMGmmFursqRgJiGLssLpdjW5b6z4kb74";
const MAINNET_JUDGE_GRADE_POLICY_ID =
  "0xcfd02fb3db64b76ca57f39bf2669a6cae6766713f593c0a52eaa5fa02aa79a46";

const judgeSteps = [
  {
    label: "Open proof",
    path: "/proof",
    why: "Verify mainnet package, pool, active policy lifecycle, and research replay.",
  },
  {
    label: "Quote cover",
    path: "/depeg",
    why: "Use the mainnet cover desk to inspect live price, pool capital, premium, and payout.",
  },
  {
    label: "Inspect integration",
    path: "/protocol",
    why: "Read SDK/PTB snippets a protocol can adapt immediately.",
  },
  {
    label: "Read SRX",
    path: "/risk-index",
    why: "See how Backstop expands from one pool into a risk clearinghouse.",
  },
];

const buildPlan = [
  "Lock one NAVI or Suilend sample object and turn the adapter contract into a production parser.",
  "Fund a keeper wallet, publish signed breach/claim/expiry receipts, and add reward accounting.",
  "LP vaults split by risk class: stablecoin depeg, SUI drawdown, and LP tail risk.",
  "DeepBook hedge router that budgets cover exposure against Predict market signals.",
  "Wallet risk warnings that label covered, uncovered, and cover-available positions.",
];

export default function CommandCenter() {
  const depeg = MAINNET_DEPEG_PROOF_PACK.depegPool!;
  const activePolicy = MAINNET_DEPEG_PROOF_PACK.productionActivePolicy;
  const stagedClaim = TESTNET_PROOF_PACK.stagedClaim!;
  const liveMarkets = RISK_MARKETS.filter(
    (market) => market.status === "mainnet-live",
  );
  const expansionMarkets = RISK_MARKETS.filter(
    (market) => market.status !== "mainnet-live",
  );

  return (
    <section className="card command-center">
      <div className="proof-head">
        <div>
          <div className="eyebrow">Submission command center</div>
          <h3>Backstop in 60 seconds.</h3>
          <p className="muted">
            If DeepBook is Sui's liquidity layer, Backstop is the risk layer:
            priced cover, keeper-readable state, protocol adapters, and public
            proof receipts.
          </p>
        </div>
        <div className="proof-pill">Primary track: DeepBook</div>
      </div>

      <div className="command-grid">
        <article>
          <span>Live product</span>
          <strong>suiUSDe depeg cover</strong>
          <p>
            Mainnet Pyth-settled pool with buy, LP, policy, proof, and SDK
            paths.
          </p>
        </article>
        <article>
          <span>Machine proof</span>
          <strong>/api/proof.json</strong>
          <p>
            Package, pool, active policy, lifecycle fields, and proof-page
            links.
          </p>
        </article>
        <article>
          <span>Operations</span>
          <strong>{KEEPER_OPERATIONS.length} keeper lanes</strong>
          <p>
            Read-only proof now; signed record, claim, and sweep paths are
            wallet-gated.
          </p>
        </article>
        <article>
          <span>Adapters</span>
          <strong>{PROTOCOL_ADAPTERS.length} verified specs</strong>
          <p>
            NAVI and Suilend integration contracts are source-bounded, not
            overclaimed.
          </p>
        </article>
        <article>
          <span>Expansion thesis</span>
          <strong>SRX risk markets</strong>
          <p>
            SUI drawdown, basket depeg, lending collateral, and LP tail risk.
          </p>
        </article>
      </div>

      <div className="section-head compact">
        <div>
          <div className="eyebrow">Judge path</div>
          <h3>Demo flow</h3>
        </div>
        <p className="muted">
          This is the exact path for a short hackathon demo. It starts with
          proof, then shows the product, then shows why protocols can integrate.
        </p>
      </div>

      <div className="demo-flow">
        {judgeSteps.map((step, index) => (
          <a className="demo-step" href={step.path} key={step.path}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{step.label}</strong>
            <em>{step.path}</em>
            <p>{step.why}</p>
          </a>
        ))}
      </div>

      <div className="section-head compact">
        <div>
          <div className="eyebrow">Evidence ledger</div>
          <h3>Mainnet proof anchors</h3>
        </div>
        <p className="muted">
          These are the hard anchors judges and integrators should inspect
          before they read any roadmap language.
        </p>
      </div>

      <div className="proof-table-wrap">
        <article className="proof-row command-row">
          <div>
            <strong>Depeg package</strong>
            <p className="muted">
              Mainnet Move package for Pyth-settled cover.
            </p>
          </div>
          <span>MAINNET</span>
          <a
            href={objectUrl(depeg.packageId, "mainnet")}
            target="_blank"
            rel="noreferrer"
          >
            open
          </a>
        </article>
        <article className="proof-row command-row">
          <div>
            <strong>Depeg pool</strong>
            <p className="muted">
              Shared pool that holds liquidity and tracks outstanding cover.
            </p>
          </div>
          <span>MAINNET</span>
          <a
            href={objectUrl(depeg.poolId, "mainnet")}
            target="_blank"
            rel="noreferrer"
          >
            open
          </a>
        </article>
        <article className="proof-row command-row">
          <div>
            <strong>Active policy example</strong>
            <p className="muted">
              Readable policy object for judge inspection.
            </p>
          </div>
          <span>MAINNET</span>
          <a
            href={
              activePolicy ? objectUrl(activePolicy.objectId, "mainnet") : "#"
            }
            target="_blank"
            rel="noreferrer"
          >
            open
          </a>
        </article>
        <article className="proof-row command-row">
          <div>
            <strong>Judge-grade policy purchase</strong>
            <p className="muted">
              Canonical live-policy proof from the Suilend consented flow.
              <span className="muted"> Policy object: </span>
              <code>{MAINNET_JUDGE_GRADE_POLICY_ID}</code>
            </p>
          </div>
          <span>MAINNET</span>
          <a
            href={txUrl(MAINNET_JUDGE_GRADE_PURCHASE_TX, "mainnet")}
            target="_blank"
            rel="noreferrer"
          >
            open tx
          </a>
        </article>
        <article className="proof-row command-row">
          <div>
            <strong>Research claim replay</strong>
            <p className="muted">
              Testnet artifact for the legacy claim lifecycle lab.
            </p>
          </div>
          <span>TESTNET</span>
          <a
            href={txUrl(stagedClaim.digest, "testnet")}
            target="_blank"
            rel="noreferrer"
          >
            open
          </a>
        </article>
      </div>

      <div className="section-head compact">
        <div>
          <div className="eyebrow">Current vs next</div>
          <h3>Risk market map</h3>
        </div>
        <p className="muted">
          The hackathon deliverable is one live cover market plus the rails to
          scale into a multi-market clearinghouse.
        </p>
      </div>

      <div className="market-grid">
        {[...liveMarkets, ...expansionMarkets].map((market) => (
          <article className="market-card" key={market.id}>
            <div className="market-top">
              <span className={`market-status ${market.status}`}>
                {statusLabel(market.status)}
              </span>
              <strong>SRX {market.score}</strong>
            </div>
            <h3>{market.title}</h3>
            <p className="muted">{market.proof}</p>
          </article>
        ))}
      </div>

      <div className="section-head compact">
        <div>
          <div className="eyebrow">Keeper operations</div>
          <h3>What runs now, what needs a signer</h3>
        </div>
        <p className="muted">
          The keeper plan is split into public read lanes, wallet-gated
          transaction lanes, partner-gated adapter lanes, and post-hackathon
          hedge routing. That keeps proof honest while making the build path
          concrete.
        </p>
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
              <b>Watches</b>
              <em>{operation.watches}</em>
            </div>
            <div className="passport-detail">
              <b>Boundary</b>
              <em>{operation.boundary}</em>
            </div>
          </article>
        ))}
      </div>

      <div className="section-head compact">
        <div>
          <div className="eyebrow">Adapter contract</div>
          <h3>Protocol evidence we must normalize</h3>
        </div>
        <p className="muted">
          These are implementation specs, not marketing claims. They define the
          exact evidence Backstop needs before a protocol position can be
          covered automatically.
        </p>
      </div>

      <div className="adapter-grid">
        {PROTOCOL_ADAPTERS.map((adapter) => (
          <article className="adapter-card" key={adapter.protocol}>
            <span>{adapter.protocol}</span>
            <h3>{adapter.adapterEntry}</h3>
            <p className="muted">{adapter.sourceVerified}</p>
            <div className="adapter-list">
              {adapter.normalizes.map((field) => (
                <em key={field}>{field}</em>
              ))}
            </div>
            <div className="passport-detail">
              <b>Boundary</b>
              <em>{adapter.currentBoundary}</em>
            </div>
          </article>
        ))}
      </div>

      <div className="section-head compact">
        <div>
          <div className="eyebrow">Post-hackathon</div>
          <h3>What we build next</h3>
        </div>
        <p className="muted">
          The north star is not an insurance demo. It is a risk clearinghouse
          protocols, LPs, wallets, and treasuries can depend on.
        </p>
      </div>

      <div className="build-plan">
        {buildPlan.map((item) => (
          <div key={item}>{item}</div>
        ))}
      </div>

      <div className="section-head compact">
        <div>
          <div className="eyebrow">Protocol targets</div>
          <h3>First integrations</h3>
        </div>
      </div>

      <div className="passport-grid">
        {PROTOCOL_PASSPORTS.slice(0, 4).map((passport) => (
          <article className="passport-card" key={passport.protocol}>
            <span>{passport.readiness.replace("-", " ")}</span>
            <h3>{passport.protocol}</h3>
            <strong>{passport.lane}</strong>
            <p className="muted">{passport.integration}</p>
            <div className="passport-detail">
              <b>Ask</b>
              <em>{passport.partnerAsk}</em>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
