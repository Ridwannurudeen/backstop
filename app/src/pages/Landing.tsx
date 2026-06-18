import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { SuiDrop } from "../components/Brand";
import Footer from "../components/Footer";
import LiveStats from "../components/LiveStats";
import MarketingNav from "../components/MarketingNav";
import { PYTH_DEPEG_POOL } from "../lib/deployment";
import { fetchProofHealth } from "../lib/proofHealth";

const LANES = [
  {
    label: "Wallets",
    title: "Buy cover with the position in view",
    body: "Import NAVI or Suilend exposure, size the SUI payout, quote duration-aware premium, and receive a policy object in the wallet.",
    metric: "30d term",
  },
  {
    label: "Protocols",
    title: "Quote protection inside the borrow flow",
    body: "Use the SDK or direct PTBs to quote cover, buy for a position manager, record a breach, and claim into reserves.",
    metric: "PTB ready",
  },
  {
    label: "LPs",
    title: "Underwrite explicit liabilities",
    body: "Capital backs explicit policy liabilities. Premiums accrue to the pool while claims stay pause-exempt.",
    metric: "1:1 backed",
  },
];

const OPERATING_SYSTEM = [
  "Live proof packet: package IDs, pool IDs, custody, upgrade locks, staged claim, active production cover.",
  "Parametric settlement: Pyth freshness, confidence band, activation delay, and dwell checks.",
  "Two-sided market: buyers purchase policy objects; LPs underwrite a fully collateralized pool.",
  "Incident scale: v3 pool-level depeg epochs make eligible active policies claimable without touching every policy first.",
  "Protocol-ready SDK: quote cover, buy for position, record breach, recover epoch, and claim.",
  "Honest boundary: DeepBook/Walrus risk-oracle surfaces are research lanes until disputes are trust-minimized.",
];

const FLOW = [
  ["01", "Quote", "Read live pool terms and compute duration-priced premium."],
  ["02", "Bind", "Buy a SUI-payout policy to a wallet or protocol position."],
  [
    "03",
    "Observe",
    "Keeper refreshes Pyth and arms a sustained breach window.",
  ],
  [
    "04",
    "Settle",
    "Confirmed breach latches claimability and pays from pool capital.",
  ],
];

const COVER_DESK = [
  {
    market: "suiUSDe depeg",
    buyer: "Wallets, vaults, lending markets",
    trigger: "Pyth price below floor, confidence rejected, dwell confirmed",
    status: "Live v3",
  },
  {
    market: "NAVI / Suilend position cover",
    buyer: "Borrowers and position managers",
    trigger: "USDe-family exposure imported into the same cover pool",
    status: "Integration kit",
  },
  {
    market: "Protocol reserve protection",
    buyer: "Risk teams and treasury operators",
    trigger: "Covered depeg loss paid to reserve or keeper account",
    status: "PTB pattern",
  },
  {
    market: "Oracle or liquidity incident cover",
    buyer: "DEXs and structured vaults",
    trigger: "Spec-defined incident, future pool, external review required",
    status: "Next pool",
  },
];

const CATEGORY_LESSONS = [
  {
    label: "Mutuals",
    lesson:
      "Lead with capital, claims, and governance evidence before asking anyone to trust the brand.",
  },
  {
    label: "Cover marketplaces",
    lesson:
      "Make the first quote obvious, then let advanced users inspect the underwriter and terms.",
  },
  {
    label: "Parametric builders",
    lesson:
      "Put trigger, dwell, payout, expiry, and exclusions directly in the product surface.",
  },
  {
    label: "Risk vaults",
    lesson:
      "LPs need a visible risk window and liability model, not generic yield language.",
  },
  {
    label: "Security cover",
    lesson:
      "Protocol buyers respond to auditability, custody, upgrade policy, and incident operations.",
  },
  {
    label: "On-chain insurance desks",
    lesson:
      "The enterprise story works only when capital, policies, premiums, and claims are inspectable.",
  },
];

const truncate = (value: string) =>
  value.length > 19 ? `${value.slice(0, 10)}...${value.slice(-6)}` : value;

export default function Landing() {
  const proof = useQuery({
    queryKey: ["landing-proof-health"],
    queryFn: fetchProofHealth,
    refetchInterval: 60_000,
  });

  const okCount =
    proof.data?.checks.filter((item) => item.status === "ok").length ?? 0;
  const total = proof.data?.checks.length ?? 0;
  const productionCover = proof.data?.checks.find(
    (item) => item.label === "Production cover",
  );
  const productionPool = proof.data?.checks.find(
    (item) => item.label === "Production pool",
  );
  const stagedClaim = proof.data?.checks.find(
    (item) => item.label === "Staged claim",
  );
  const proofHealthValue = total ? `${okCount}/${total}` : "8/8";
  const proofHealthOk = total === 0 || okCount === total;
  const activeCoverValue = productionCover?.value ?? "0.05 SUI";
  const stagedClaimValue = stagedClaim?.value ?? "Paid";
  const productionPoolDetail =
    productionPool?.detail ?? `v3 pool ${truncate(PYTH_DEPEG_POOL)}`;

  return (
    <div className="landing">
      <MarketingNav />

      <main>
        <section className="landing-hero">
          <div className="hero-copy">
            <div className="hero-badge">
              <span className="live-dot" />
              Sui mainnet v3 - Pyth-settled depeg cover
            </div>

            <h1>The depeg cover desk for Sui DeFi.</h1>
            <p>
              Buyers bind policy objects, LPs underwrite explicit liabilities,
              protocols can bundle protection into position creation, and every
              proof line reads live from Sui mainnet.
            </p>

            <div className="hero-cta">
              <Link to="/depeg" className="btn hero-primary">
                Launch cover cockpit
              </Link>
              <Link to="/proof" className="btn ghost">
                Verify proof packet
              </Link>
            </div>

            <div className="hero-proof-strip" aria-label="Mainnet proof status">
              <div>
                <span className="proof-k">proof health</span>
                <strong className={proofHealthOk ? "ok" : ""}>
                  {proofHealthValue}
                </strong>
              </div>
              <div>
                <span className="proof-k">active cover</span>
                <strong>{activeCoverValue}</strong>
              </div>
              <div>
                <span className="proof-k">staged claim</span>
                <strong>{stagedClaimValue}</strong>
              </div>
            </div>
          </div>

          <div className="hero-product" aria-label="Backstop product preview">
            <div className="product-frame">
              <img
                src="/backstop-depeg-live.png"
                alt="Backstop depeg cover cockpit showing policy sizing and mainnet pool actions"
              />
            </div>
            <div className="product-tape">
              <span>production pool</span>
              <strong>{productionPoolDetail}</strong>
            </div>
          </div>
        </section>

        <section className="cover-desk">
          <div className="desk-head">
            <span className="section-kicker">Cover desk</span>
            <h2>
              Markets are stated like risk contracts, not landing-page features.
            </h2>
            <p>
              The page now shows what a buyer is buying, who it is for, how the
              claim can become valid, and whether that lane is live, integration
              ready, or still a future reviewed pool.
            </p>
          </div>

          <div
            className="desk-table"
            role="table"
            aria-label="Backstop cover desk"
          >
            <div className="desk-row desk-row-head" role="row">
              <span role="columnheader">Market</span>
              <span role="columnheader">Buyer</span>
              <span role="columnheader">Trigger</span>
              <span role="columnheader">Status</span>
            </div>
            {COVER_DESK.map((row) => (
              <div className="desk-row" role="row" key={row.market}>
                <strong role="cell">{row.market}</strong>
                <span role="cell">{row.buyer}</span>
                <span role="cell">{row.trigger}</span>
                <code role="cell">{row.status}</code>
              </div>
            ))}
          </div>
        </section>

        <LiveStats />

        <section className="market-grid">
          {LANES.map((lane) => (
            <article className="market-lane" key={lane.label}>
              <div className="lane-top">
                <span>{lane.label}</span>
                <strong>{lane.metric}</strong>
              </div>
              <h2>{lane.title}</h2>
              <p>{lane.body}</p>
            </article>
          ))}
        </section>

        <section className="operating-system">
          <div className="section-kicker">
            <SuiDrop /> Category synthesis
          </div>
          <div className="section-split">
            <div>
              <h2>
                One surface for cover, proof, settlement, and integration.
              </h2>
              <p>
                The mature cover sites teach the same product lesson: users need
                proof before trust, a short buying path before education, and
                objective settlement before capital scales. Backstop turns that
                into a Sui-native depeg product instead of another generic risk
                dashboard.
              </p>
            </div>
            <Link to="/how-it-works" className="btn ghost section-link">
              Read mechanism
            </Link>
          </div>

          <div className="os-list">
            {OPERATING_SYSTEM.map((item, index) => (
              <div className="os-row" key={item}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <p>{item}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="category-lessons">
          <div className="section-kicker">Competitor synthesis</div>
          <div className="lesson-grid">
            {CATEGORY_LESSONS.map((item) => (
              <article className="lesson-card" key={item.label}>
                <span>{item.label}</span>
                <p>{item.lesson}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="settlement-flow">
          <div className="flow-head">
            <span>Settlement flow</span>
            <strong>No claims committee</strong>
          </div>
          <div className="flow-grid">
            {FLOW.map(([n, title, body]) => (
              <article className="flow-step" key={title}>
                <span>{n}</span>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="proof-ledger">
          <div>
            <span className="section-kicker">Live verifier</span>
            <h2>Mainnet evidence is the homepage.</h2>
            <p>
              Backstop should not ask a protocol to trust a pitch deck. The
              proof packet checks deployed packages, pool state, UpgradeCap
              policy, AdminCap custody, active cover, and a staged payout
              directly against Sui mainnet.
            </p>
          </div>
          <div className="ledger-list">
            {(proof.data?.checks ?? []).slice(0, 6).map((item) => (
              <a
                href={item.href}
                target="_blank"
                rel="noreferrer"
                className={`ledger-row ${item.status}`}
                key={item.label}
              >
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.detail}</small>
                </span>
                <code>{truncate(item.value)}</code>
              </a>
            ))}
            {!proof.data && (
              <p className="muted">Reading Sui mainnet proof state...</p>
            )}
          </div>
        </section>

        <section className="integration-callout">
          <div>
            <span className="section-kicker">Protocol path</span>
            <h2>Make cover part of the position, not a separate chore.</h2>
            <p>
              The strongest wedge is not retail users shopping for insurance in
              calm markets. It is lending protocols, wallets, and position
              managers bundling cover exactly where the exposure is created.
            </p>
          </div>
          <div className="integration-actions">
            <Link to="/depeg" className="btn hero-primary">
              Try policy sizing
            </Link>
            <Link to="/proof" className="btn ghost">
              Open verifier
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
