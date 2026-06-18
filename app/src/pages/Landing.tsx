import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { SuiDrop } from "../components/Brand";
import Footer from "../components/Footer";
import LiveStats from "../components/LiveStats";
import MarketingNav from "../components/MarketingNav";
import { fetchProofHealth } from "../lib/proofHealth";

const LANES = [
  {
    label: "Wallets",
    title: "Buy cover around an actual position",
    body: "Import NAVI or Suilend exposure, size the SUI payout, quote premium, and receive a policy object in the wallet.",
    metric: "30d term",
  },
  {
    label: "Protocols",
    title: "Bundle protection into lending flows",
    body: "Use the SDK or direct PTBs to quote cover, buy for a position manager, record a breach, and claim into reserves.",
    metric: "PTB ready",
  },
  {
    label: "LPs",
    title: "Underwrite transparent depeg risk",
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

            <h1>Depeg cover that settles like infrastructure.</h1>
            <p>
              Backstop packages the best parts of DeFi cover into one Sui-native
              product: simple purchase flow, objective parametric settlement,
              two-sided underwriting, live proof, and protocol integration
              rails.
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
                <strong className={total > 0 && okCount === total ? "ok" : ""}>
                  {total ? `${okCount}/${total}` : "-"}
                </strong>
              </div>
              <div>
                <span className="proof-k">active cover</span>
                <strong>{productionCover?.value ?? "-"}</strong>
              </div>
              <div>
                <span className="proof-k">staged claim</span>
                <strong>{stagedClaim?.value ?? "-"}</strong>
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
              <strong>
                {productionPool?.detail ?? "Reading Sui mainnet..."}
              </strong>
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
