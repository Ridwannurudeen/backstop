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

const COVER_VAULTS = [
  {
    cover: "100%",
    term: "30d",
    provider: "Backstop",
    market: "Covered suiUSDe Depeg",
    metric: "Live v3",
    description:
      "SUI-payout cover for suiUSDe-family exposure, settled by Pyth price, confidence band, activation delay, and dwell.",
    links: ["Policy", "Proof", "SDK"],
    rows: [
      ["Cover capacity", "0.05 / 1.0019 SUI"],
      ["Trigger", "Pyth <= $0.985 + dwell"],
      ["Position import", "NAVI / Suilend"],
    ],
    primary: "Buy cover",
    secondary: "Verify",
    primaryTo: "/depeg",
    secondaryTo: "/proof",
  },
  {
    cover: "100%",
    term: "PTB",
    provider: "Protocol kit",
    market: "Covered Lending Reserve",
    metric: "Ready",
    description:
      "Protocol-owned policy objects that can be bought at position creation and claimed into reserves during a covered depeg.",
    links: ["SDK", "PTB", "Audit"],
    rows: [
      ["Buyer", "Risk teams"],
      ["Payout route", "Reserve or keeper account"],
      ["Integration", "Copy-paste examples"],
    ],
    primary: "Read SDK",
    secondary: "Proof",
    primaryTo: "/proof",
    secondaryTo: "/proof",
  },
  {
    cover: "1:1",
    term: "LP",
    provider: "Underwriting",
    market: "SUI Cover Capital",
    metric: "Funded",
    description:
      "LP capital backs explicit outstanding liabilities; premiums accrue while claims stay available through guarded settlement paths.",
    links: ["Terms", "Proof", "Pool"],
    rows: [
      ["Collateral", "SUI"],
      ["Liability model", "Fully collateralized"],
      ["Exit path", "Withdraw share object"],
    ],
    primary: "Underwrite",
    secondary: "Pool proof",
    primaryTo: "/depeg",
    secondaryTo: "/proof",
  },
  {
    cover: "Spec",
    term: "Review",
    provider: "Next pool",
    market: "Oracle / Liquidity Incident",
    metric: "Queued",
    description:
      "A future reviewed pool for DEXs and vaults that need explicit incident definitions before capital is accepted.",
    links: ["Spec", "Review", "Scope"],
    rows: [
      ["Buyer", "DEXs and vaults"],
      ["Settlement", "Spec-defined event"],
      ["Status", "External review required"],
    ],
    primary: "Read mechanism",
    secondary: "Proof",
    primaryTo: "/how-it-works",
    secondaryTo: "/proof",
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
              A vault-style market for Sui cover, with proof beside every lane.
            </h2>
            <p>
              OpenCover's vault interface works because every card answers the
              same questions fast: what is covered, who curates it, what capital
              backs it, and where the proof lives. Backstop applies that pattern
              to Sui-native depeg risk.
            </p>
          </div>

          <div className="vault-tabs" aria-label="Cover market filters">
            <span className="active">Sui mainnet</span>
            <span>Position cover</span>
            <span>LP capital</span>
            <span>Future pools</span>
          </div>

          <div className="vault-grid">
            {COVER_VAULTS.map((vault) => (
              <article className="vault-card" key={vault.market}>
                <div className="vault-band">
                  <div className="vault-chips">
                    <span>{vault.cover}</span>
                    <span>{vault.term}</span>
                  </div>
                  <button type="button" aria-label={`${vault.market} actions`}>
                    <span />
                    <span />
                    <span />
                  </button>
                </div>

                <div className="vault-provider">
                  <SuiDrop size={30} />
                  <strong>{vault.provider}</strong>
                </div>

                <div className="vault-title-row">
                  <h3>{vault.market}</h3>
                  <div>
                    <strong>{vault.metric}</strong>
                    <span className="vault-shield">verified</span>
                  </div>
                </div>

                <p>{vault.description}</p>

                <div className="vault-links">
                  {vault.links.map((link) => (
                    <Link to="/proof" key={`${vault.market}-${link}`}>
                      {link}
                    </Link>
                  ))}
                </div>

                <div className="vault-rows">
                  {vault.rows.map(([label, value]) => (
                    <div className="vault-row" key={`${vault.market}-${label}`}>
                      <span>{label}</span>
                      <strong>{value}</strong>
                    </div>
                  ))}
                </div>

                <div className="vault-actions">
                  <Link to={vault.secondaryTo} className="btn ghost">
                    {vault.secondary}
                  </Link>
                  <Link to={vault.primaryTo} className="btn hero-primary">
                    {vault.primary}
                  </Link>
                </div>
              </article>
            ))}
          </div>

          <div
            className="desk-table"
            role="table"
            aria-label="Backstop cover terms"
          >
            <div className="desk-row desk-row-head" role="row">
              <span role="columnheader">Market</span>
              <span role="columnheader">Buyer</span>
              <span role="columnheader">Trigger</span>
              <span role="columnheader">Status</span>
            </div>
            <div className="desk-row" role="row">
              <strong role="cell">suiUSDe depeg</strong>
              <span role="cell">Wallets, vaults, lending markets</span>
              <span role="cell">
                Pyth price below floor, confidence rejected, dwell confirmed
              </span>
              <code role="cell">Live v3</code>
            </div>
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
