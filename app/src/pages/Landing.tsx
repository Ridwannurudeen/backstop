import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import ClaimReplay from "../components/ClaimReplay";
import Footer from "../components/Footer";
import MarketingNav from "../components/MarketingNav";
import { PYTH_DEPEG_POOL } from "../lib/deployment";
import { fetchProofHealth } from "../lib/proofHealth";

const LIFECYCLE = [
  ["01", "Quote", "Choose exposure, trigger, settlement asset, and term."],
  ["02", "Fund", "Premium enters a pre-funded SUI cover pool."],
  ["03", "Observe", "A fresh Pyth reading is evaluated against the policy."],
  ["04", "Settle", "Breach plus completed dwell makes the claim eligible."],
  ["05", "Prove", "Inspect the policy, pool movement, and transaction."],
];

const PRODUCT_RAILS = [
  {
    network: "Sui mainnet",
    title: "Pyth depeg cover",
    status: "Production rail",
    body: "suiUSDe-family protection with objective Pyth settlement, activation delay, dwell, confidence checks, and a pre-funded SUI payout pool.",
    cta: "Open cover desk",
    to: "/depeg",
  },
  {
    network: "Sui testnet lab",
    title: "DeepBook crash lab",
    status: "Research rail",
    body: "Market-implied crash pricing from DeepBook Predict, Walrus decision records, and deterministic underwriting receipts. Not the mainnet cover product.",
    cta: "Inspect agent records",
    to: "/agent/ai",
  },
];

const UNDERWRITING_RECEIPT = [
  ["Decision", "ACCEPT"],
  ["Market-implied risk", "13.76%"],
  ["Capacity", "$36,346"],
  ["Premium", "1,720 bps"],
  ["Committed", "$3.63"],
  ["Decision engine", "Deterministic rules"],
  ["Walrus record", "Verified"],
  ["Sui execution", "Confirmed"],
];

const RESERVE_FLOW = [
  "Reserve exposed",
  "Cover purchased",
  "Depeg confirmed",
  "Claim paid",
  "Reserve recapitalized",
];

const truncate = (value: string) =>
  value.length > 19 ? `${value.slice(0, 10)}...${value.slice(-6)}` : value;

const poolCollateral = (detail?: string) => {
  if (!detail) return "—";
  const [value] = detail.split(" TVL");
  return value || "—";
};

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
    (item) => item.label === "Archived staged claim",
  );
  const proofHealthValue = total ? `${okCount}/${total}` : "checking…";
  const proofHealthOk = total > 0 && okCount === total;
  const activeCoverValue = productionCover?.value ?? "—";
  const stagedClaimValue = stagedClaim?.value ?? "—";
  const productionPoolDetail =
    productionPool?.detail ?? `v5 pool ${truncate(PYTH_DEPEG_POOL)}`;

  return (
    <div className="landing">
      <MarketingNav />

      <main>
        <section className="landing-hero">
          <div className="hero-copy">
            <div className="hero-badge">
              <span className="live-dot" />
              Sui mainnet - Pyth-settled depeg protection
            </div>

            <h1>When the peg breaks, the payout path is already written.</h1>
            <p>
              Buy pre-funded depeg protection for wallets and protocols. A fresh
              Pyth reading confirms the breach, the contract enforces the dwell
              rule, and an eligible claim is paid from the cover pool.
            </p>

            <div className="hero-cta">
              <a href="#claim-replay" className="btn hero-primary">
                Replay a paid claim
              </a>
              <Link to="/depeg" className="btn ghost">
                Open cover desk
              </Link>
            </div>

            <p className="hero-proof-line">
              Pre-funded pool / objective trigger / public settlement proof
            </p>
          </div>

          <ClaimReplay />
        </section>

        <section className="hero-proof-strip" aria-label="Mainnet proof status">
          <div>
            <span className="proof-k">pool collateral</span>
            <strong>{poolCollateral(productionPool?.detail)}</strong>
            <small>{productionPoolDetail}</small>
          </div>
          <div>
            <span className="proof-k">active cover</span>
            <strong>{activeCoverValue}</strong>
            <small>production policy liability</small>
          </div>
          <div>
            <span className="proof-k">proof health</span>
            <strong className={proofHealthOk ? "ok" : ""}>
              {proofHealthValue}
            </strong>
            <small>live Sui mainnet checks</small>
          </div>
          <div>
            <span className="proof-k">archived staged claim</span>
            <strong>{stagedClaimValue}</strong>
            <small>captured payout proof</small>
          </div>
        </section>

        <section className="protection-lifecycle">
          <div className="section-intro">
            <span className="section-kicker">How claims settle</span>
            <h2>
              Protection is useful only if the settlement path is explicit.
            </h2>
            <p>
              Backstop shows the path before purchase: quote the exposure, fund
              the cover pool, observe the oracle, enforce dwell, then prove the
              receipt and payout.
            </p>
          </div>
          <div className="lifecycle-grid">
            {LIFECYCLE.map(([number, title, body]) => (
              <article className="lifecycle-step" key={title}>
                <span>{number}</span>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="product-rails">
          <div className="section-intro">
            <span className="section-kicker">Product rails</span>
            <h2>Mainnet cover and testnet research are separate on purpose.</h2>
            <p>
              The production product is Pyth-settled depeg cover. DeepBook
              Predict, Walrus receipts, and agent underwriting remain a labelled
              testnet lab until that dispute layer is production-ready.
            </p>
          </div>
          <div className="rail-grid">
            {PRODUCT_RAILS.map((rail) => (
              <article className="rail-card" key={rail.title}>
                <div className="rail-top">
                  <span>{rail.network}</span>
                  <strong>{rail.status}</strong>
                </div>
                <h3>{rail.title}</h3>
                <p>{rail.body}</p>
                <Link to={rail.to} className="btn ghost">
                  {rail.cta}
                </Link>
              </article>
            ))}
          </div>
        </section>

        <section className="underwriting-receipt">
          <div>
            <span className="section-kicker">Accountable underwriting</span>
            <h2>One decision receipt is easier to trust than a log feed.</h2>
            <p>
              The DeepBook lab records every input, rule, capacity decision,
              Walrus proof, and Sui execution. Declines matter too: they show
              when the engine refuses risk instead of forcing capacity.
            </p>
            <Link to="/agent/ai" className="btn ghost section-link">
              Open all receipts
            </Link>
          </div>
          <div className="receipt-ledger">
            <p className="muted">
              Testnet lab - historical sample decision, not a live attestation.
            </p>
            <div className="receipt-ledger-head">
              <span>BTC &lt; $56,868</span>
              <strong>Accepted</strong>
            </div>
            {UNDERWRITING_RECEIPT.map(([label, value]) => (
              <div className="receipt-ledger-row" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="reserve-flow-section">
          <div className="section-intro">
            <span className="section-kicker">Protocol integration</span>
            <h2>Make cover part of the position, not a separate chore.</h2>
            <p>
              The real wedge is protocol-native protection: lending markets and
              position managers can buy cover where exposure is created, then
              claim into reserves when objective conditions are met.
            </p>
          </div>
          <div className="reserve-flow">
            {RESERVE_FLOW.map((item, index) => (
              <div className="reserve-flow-node" key={item}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{item}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="proof-ledger">
          <div>
            <span className="section-kicker">Verification</span>
            <h2>Mainnet evidence is the product surface.</h2>
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
            <span className="section-kicker">Cover desk</span>
            <h2>Review the quote, then inspect the proof.</h2>
            <p>
              The cover desk keeps wallet actions, policy state, underwriting,
              keeper status, and proof-health visible without changing the
              underlying Sui transaction builders.
            </p>
          </div>
          <div className="integration-actions">
            <Link to="/depeg" className="btn hero-primary">
              Open cover desk
            </Link>
            <Link to="/proof" className="btn ghost">
              Open proof center
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
