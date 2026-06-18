export type RiskMarketStatus =
  | "mainnet-live"
  | "integration-ready"
  | "research-lane";

export type RiskMarket = {
  id: string;
  title: string;
  asset: string;
  status: RiskMarketStatus;
  score: number;
  exposureUsd: string;
  premiumBand: string;
  coverLimit: string;
  signal: string;
  deepBookRole: string;
  proof: string;
  next: string;
};

export type ProtocolPassport = {
  protocol: string;
  lane: string;
  readiness:
    | "integration-blueprint"
    | "sample-validated"
    | "design-ready"
    | "target";
  risk: string;
  integration: string;
  proof: string;
  coveredExposure: string;
  trigger: string;
  requiredEvidence: string;
  policyStorage: string;
  partnerAsk: string;
};

export type ClearinghouseMetric = {
  label: string;
  value: string;
  helper: string;
};

export type KeeperOperationStatus =
  | "public-now"
  | "wallet-gated"
  | "partner-gated"
  | "post-hackathon";

export type KeeperOperation = {
  id: string;
  lane: string;
  status: KeeperOperationStatus;
  cadence: string;
  watches: string;
  action: string;
  proof: string;
  boundary: string;
};

export type ProtocolAdapterSpec = {
  protocol: string;
  sourceVerified: string;
  adapterEntry: string;
  reads: string[];
  normalizes: string[];
  coverDecision: string;
  policyBinding: string;
  currentBoundary: string;
  next: string;
};

export type BuildStatus =
  | "live"
  | "scripted"
  | "wallet-gated"
  | "partner-gated"
  | "capital-gated";

export type LpVaultBlueprint = {
  name: string;
  status: BuildStatus;
  riskClass: string;
  accepts: string;
  earns: string;
  coverMarkets: string;
  gatingRule: string;
};

export type HedgeRouterModule = {
  name: string;
  status: BuildStatus;
  signal: string;
  decision: string;
  output: string;
};

export type WalletWarningRule = {
  id: string;
  status: BuildStatus;
  label: string;
  match: string;
  risk: string;
  action: string;
  route: string;
};

export type ReportProduct = {
  name: string;
  status: BuildStatus;
  audience: string;
  source: string;
  output: string;
};

export type ReputationSignal = {
  name: string;
  status: BuildStatus;
  subject: string;
  positiveEvent: string;
  negativeEvent: string;
  proof: string;
};

export const CLEARINGHOUSE_METRICS: ClearinghouseMetric[] = [
  {
    label: "Primary track",
    value: "DeepBook",
    helper: "Pricing and hedge signals anchor the cover market.",
  },
  {
    label: "Production lane",
    value: "Sui mainnet",
    helper: "Package, pool, policy, and proof surfaces are public.",
  },
  {
    label: "Proof rail",
    value: "Walrus + Sui",
    helper: "Receipts, txs, and state checks are replayable.",
  },
  {
    label: "Integrator path",
    value: "SDK + PTB",
    helper: "Protocols can quote, buy, record, claim, and verify.",
  },
];

export const KEEPER_OPERATIONS: KeeperOperation[] = [
  {
    id: "pool-watch",
    lane: "Pool solvency watch",
    status: "public-now",
    cadence: "30s read loop",
    watches:
      "Pool funds, total cover, threshold, activation delay, policy expiry.",
    action: "Publish pool health, capacity, and proof rows without a signer.",
    proof: "/proof mainnet lifecycle and /api/proof.json",
    boundary: "Read-only; no transaction authority.",
  },
  {
    id: "breach-observer",
    lane: "Breach observation",
    status: "wallet-gated",
    cadence: "Oracle tick after threshold breach",
    watches: "Pyth PriceInfo object, policy owner, breach start, dwell window.",
    action: "Build a record-breach PTB for a keeper wallet to sign.",
    proof: "Policy object exposes breach/armed fields after execution.",
    boundary:
      "Requires a funded keeper signer; no automatic signing from the public app.",
  },
  {
    id: "claim-latch",
    lane: "Dwell confirmation and claim",
    status: "wallet-gated",
    cadence: "After pool activation delay",
    watches: "Policy latch fields, owner, pool capital, expiry.",
    action:
      "Build claim-latched PTB and surface exact next action to the policy holder.",
    proof: "Claim digest and policy fields once signed.",
    boundary:
      "No paid-claim claim is made unless a digest and policy state prove it.",
  },
  {
    id: "expiry-sweep",
    lane: "Expiry sweep",
    status: "wallet-gated",
    cadence: "After policy expiry",
    watches: "Expired policies, unpaid/lapsed state, pool outstanding cover.",
    action:
      "Build expire-policy PTB so stale cover can be swept permissionlessly.",
    proof: "Pool total cover and policy object after sweep.",
    boundary: "Permissionless transaction still needs a signer and gas.",
  },
  {
    id: "adapter-sync",
    lane: "Protocol exposure sync",
    status: "partner-gated",
    cadence: "Protocol-defined epoch",
    watches: "NAVI/Suilend account, obligation, reserve, and vault evidence.",
    action:
      "Normalize covered exposure and map policy IDs to protocol positions.",
    proof: "Protocol passport plus adapter evidence record.",
    boundary:
      "Requires partner-confirmed object schema before production automation.",
  },
  {
    id: "hedge-router",
    lane: "DeepBook hedge budget",
    status: "post-hackathon",
    cadence: "Before capacity expansion",
    watches:
      "DeepBook/Predict depth, liquidity shock, peg drift, pool utilization.",
    action:
      "Gate underwriting capacity and propose hedges for tail-risk buckets.",
    proof: "SRX reading and hedge-budget receipt.",
    boundary:
      "Design target until a funded hedge budget and market limits are approved.",
  },
];

export const RISK_MARKETS: RiskMarket[] = [
  {
    id: "suiusde-depeg",
    title: "suiUSDe depeg cover",
    asset: "suiUSDe",
    status: "mainnet-live",
    score: 84,
    exposureUsd: "$100k pilot lane",
    premiumBand: "2.5%-8.0% annualized",
    coverLimit: "Pool capped by funded liquidity",
    signal: "Pyth price object, dwell window, on-chain pool state",
    deepBookRole:
      "Predict surface calibrates crash probability and hedge budget.",
    proof:
      "Mainnet package, pool, active policy, staged claim replay, and Suilend sample parser.",
    next: "Bind parsed Suilend exposure rows to Backstop policy IDs after consent.",
  },
  {
    id: "sui-crash",
    title: "SUI drawdown cover",
    asset: "SUI",
    status: "integration-ready",
    score: 78,
    exposureUsd: "$250k target capacity",
    premiumBand: "3.0%-12.0% annualized",
    coverLimit: "Strike and duration bounded per pool",
    signal: "DeepBook Predict strike ladder plus Pyth reference price.",
    deepBookRole: "Predict is the market-implied crash curve for cover quotes.",
    proof: "Risk terminal and agent underwriting receipt path.",
    next: "Publish dedicated SUI crash pool once liquidity budget is approved.",
  },
  {
    id: "stablecoin-basket",
    title: "Stablecoin basket failure",
    asset: "USDC / suiUSDe / BUCK",
    status: "integration-ready",
    score: 72,
    exposureUsd: "$500k target capacity",
    premiumBand: "1.8%-9.5% annualized",
    coverLimit: "Basket cap per issuer and oracle source",
    signal: "Peg drift, oracle freshness, redemption depth, venue liquidity.",
    deepBookRole:
      "DeepBook liquidity depth gates max capacity and hedge routing.",
    proof: "Static passport now; live adapter after protocol object mapping.",
    next: "Add issuer-specific passports and per-asset keeper rules.",
  },
  {
    id: "lending-collateral",
    title: "Lending collateral shock",
    asset: "SUI collateral accounts",
    status: "research-lane",
    score: 67,
    exposureUsd: "$1m target monitor",
    premiumBand: "4.0%-15.0% annualized",
    coverLimit: "Per-market utilization and liquidation depth",
    signal: "Borrow utilization, collateral drawdown, oracle staleness.",
    deepBookRole: "Predict probability informs reserve factor and cover cost.",
    proof:
      "Suilend sample parser is live; NAVI parser still needs an object sample.",
    next: "Attach Suilend exposure rows to borrower-bucket policy mapping.",
  },
  {
    id: "lp-tail",
    title: "LP tail-risk cover",
    asset: "DeepBook / Cetus / Turbos LPs",
    status: "research-lane",
    score: 63,
    exposureUsd: "$750k target monitor",
    premiumBand: "5.0%-18.0% annualized",
    coverLimit: "Vault-specific impermanent-loss threshold",
    signal: "Volatility, inventory skew, volume shock, depth collapse.",
    deepBookRole: "Hedge router can buy Predict protection against tail moves.",
    proof: "Design-ready; needs pool and LP receipt adapter.",
    next: "Model LP inventory drawdown and publish a first vault passport.",
  },
];

export const PROTOCOL_ADAPTERS: ProtocolAdapterSpec[] = [
  {
    protocol: "NAVI",
    sourceVerified:
      "Official NAVI developer docs describe lending_core, oracle feeds, SDK interaction, and user-specific account data; the old navi-sdk README now marks that package as legacy and points to split SDK packages.",
    adapterEntry:
      "Protocol service or wallet widget that owns user consent and reads NAVI exposure.",
    reads: [
      "Covered account or vault object",
      "Covered asset balance and oracle price",
      "Borrow/collateral bucket and risk budget",
      "Backstop policy object after purchase",
    ],
    normalizes: [
      "positionId",
      "account",
      "assetType",
      "coverMist",
      "riskBudgetMist",
      "evidence",
    ],
    coverDecision:
      "Quote Backstop premium and buy only when premium <= protocol risk budget.",
    policyBinding:
      "Store policy ID beside the NAVI account/vault bucket in a protocol-owned registry or service table.",
    currentBoundary:
      "Schema confirmation is still required before Backstop can claim live NAVI position validation.",
    next: "Get one NAVI borrower/vault object sample and lock the adapter parser.",
  },
  {
    protocol: "Suilend",
    sourceVerified:
      "Suilend docs define LendingMarket, Reserves, Obligations, and cTokens; Backstop now parses a live Suilend main-pool obligation from tx 2PBCaEbBHiFLU7fDwU4zihUq4CQtKArbXXC9JygTL169.",
    adapterEntry:
      "Read-only Suilend obligation scanner that converts deposits/borrows into Backstop exposure rows.",
    reads: [
      "LendingMarket object",
      "Reserve for the covered asset",
      "Obligation deposits and borrows",
      "cToken or collateral evidence",
    ],
    normalizes: [
      "positionId",
      "obligationId",
      "reserveType",
      "coverMist",
      "riskBudgetMist",
      "evidence",
    ],
    coverDecision:
      "Cover borrower or vault buckets only after SDK refresh and reserve/obligation evidence is recorded.",
    policyBinding:
      "Map Backstop policy IDs to obligation IDs so claims can require both oracle breach and covered-position evidence.",
    currentBoundary:
      "Sample-validated parser is live; production auto-cover requires partner approval for consent, governance caps, and supported markets.",
    next: "Convert the sample parser into a consented Suilend auto-cover flow.",
  },
];

export const LP_VAULT_BLUEPRINTS: LpVaultBlueprint[] = [
  {
    name: "Stablecoin depeg vault",
    status: "live",
    riskClass: "Peg failure",
    accepts: "SUI collateral today; stablecoin collateral after audit",
    earns: "Premium from suiUSDe and basket-depeg policies",
    coverMarkets: "suiUSDe now, USDC / BUCK / issuer basket next",
    gatingRule:
      "Capacity capped by pool funds, oracle confidence, and SRX score.",
  },
  {
    name: "SUI drawdown vault",
    status: "capital-gated",
    riskClass: "Market drawdown",
    accepts: "SUI or protocol-approved stablecoin collateral",
    earns: "Crash-cover premiums priced from DeepBook/Predict signals",
    coverMarkets: "Treasury drawdown, borrower collateral shock",
    gatingRule: "Requires funded pool and hedge budget before production.",
  },
  {
    name: "LP tail-risk vault",
    status: "partner-gated",
    riskClass: "Liquidity and inventory shock",
    accepts: "DeepBook/Cetus/Turbos LP strategy capital after adapter review",
    earns: "Tail-risk cover premiums from LP and protocol positions",
    coverMarkets: "LP inventory drawdown, depth collapse, correlated depeg",
    gatingRule:
      "Requires partner LP receipt parser and venue-specific risk caps.",
  },
];

export const HEDGE_ROUTER_MODULES: HedgeRouterModule[] = [
  {
    name: "Capacity governor",
    status: "scripted",
    signal: "Pool utilization, SRX score, oracle confidence, max cover cap",
    decision: "Raise, freeze, or reduce available cover for a risk lane",
    output: "Capacity receipt in the proof report",
  },
  {
    name: "DeepBook depth check",
    status: "capital-gated",
    signal: "DeepBook liquidity and executable hedge depth",
    decision: "Limit underwriting when hedge depth cannot absorb tail exposure",
    output: "Hedge budget and max policy size",
  },
  {
    name: "Predict crash curve",
    status: "capital-gated",
    signal: "DeepBook Predict strike ladder and implied probability",
    decision: "Price SUI drawdown and LP tail-risk cover",
    output: "Crash premium band and hedge trigger",
  },
];

export const WALLET_WARNING_RULES: WalletWarningRule[] = [
  {
    id: "sui",
    status: "live",
    label: "SUI drawdown exposure",
    match: "0x2::sui::SUI",
    risk: "Native asset drawdown can affect treasury and collateral health.",
    action: "Route to SUI drawdown cover when the pool is funded.",
    route: "/risk-index",
  },
  {
    id: "stablecoin",
    status: "live",
    label: "Stablecoin peg exposure",
    match: "USDC, USDE, BUCK, USDY",
    risk: "Peg drift or issuer stress can create correlated portfolio losses.",
    action:
      "Route to the depeg cover desk when the asset has a supported pool.",
    route: "/depeg",
  },
  {
    id: "lp",
    status: "partner-gated",
    label: "LP tail-risk exposure",
    match: "LP, CLMM, DEEP",
    risk: "Inventory skew, volatility, and depth collapse can exceed fee income.",
    action: "Route to LP tail-risk passport after receipt adapter validation.",
    route: "/risk-index",
  },
];

export const REPORT_PRODUCTS: ReportProduct[] = [
  {
    name: "Public proof report",
    status: "scripted",
    audience: "Judges, integrators, wallet teams",
    source: "/api/proof.json, /api/risk-index.json, deployment.json",
    output: "/api/report.json plus reports/backstop-risk-report.md",
  },
  {
    name: "Protocol risk passport",
    status: "partner-gated",
    audience: "NAVI, Suilend, Bucket, Scallop",
    source: "Protocol object sample, Backstop policy ID, SRX score",
    output: "Partner-specific coverage and evidence report",
  },
  {
    name: "Underwriter statement",
    status: "capital-gated",
    audience: "LPs and treasury allocators",
    source: "Vault capital, premium flow, claims, sweeps, keeper receipts",
    output: "Epoch report for underwriting performance",
  },
];

export const REPUTATION_SIGNALS: ReputationSignal[] = [
  {
    name: "Keeper reliability",
    status: "wallet-gated",
    subject: "Keeper address",
    positiveEvent:
      "Timely breach, claim, or expiry transaction with valid effect",
    negativeEvent: "Missed dwell window or failed transaction after alert",
    proof: "Transaction digest and policy state delta",
  },
  {
    name: "Underwriter solvency",
    status: "capital-gated",
    subject: "LP vault or underwriter address",
    positiveEvent: "Maintains funded capacity and pays valid claims",
    negativeEvent: "Capacity exhaustion, paused pool, or unpaid claim",
    proof: "Pool state, policy state, and claim digest",
  },
  {
    name: "Adapter accuracy",
    status: "partner-gated",
    subject: "Protocol adapter",
    positiveEvent: "Position evidence matches policy binding and claim rules",
    negativeEvent: "Mismatched exposure, stale object, or unsupported asset",
    proof: "Adapter probe output and partner-approved parser version",
  },
];

export const PROTOCOL_PASSPORTS: ProtocolPassport[] = [
  {
    protocol: "NAVI",
    lane: "Lending collateral protection",
    readiness: "integration-blueprint",
    risk: "Borrowers and vaults exposed to stablecoin depeg or SUI drawdown.",
    integration:
      "Read account exposure, quote cover per bucket, persist policy IDs.",
    proof: "SDK flow: read pool -> quote -> buy -> record breach -> claim.",
    coveredExposure:
      "Borrower/vault exposure to suiUSDe and correlated stablecoin collateral.",
    trigger:
      "Sustained oracle breach below policy threshold plus protocol-side exposure match.",
    requiredEvidence:
      "Account/vault object, covered asset balance, policy object, pool state.",
    policyStorage:
      "Map protocol account or vault bucket to Backstop policy object ID.",
    partnerAsk: "Confirm object schema and permission path for exposure reads.",
  },
  {
    protocol: "Suilend",
    lane: "Borrower risk backstop",
    readiness: "sample-validated",
    risk: "Liquidation cascades when collateral or peg signals move faster than users.",
    integration:
      "Route account-level cover through protocol-owned adapter service.",
    proof:
      "Sample parser reads Suilend obligation 0xffff7cfccd5049bc6f5adb20a770a822f920a3f78690213b08c231884763bf6a and normalizes SUI collateral exposure.",
    coveredExposure:
      "Borrower collateral and isolated vault exposure to depeg or sharp drawdown.",
    trigger:
      "Oracle depeg breach plus borrower bucket included in covered policy registry.",
    requiredEvidence:
      "Borrower position, collateral token type, cover amount, policy object.",
    policyStorage:
      "Store policy ID beside borrower bucket in adapter service or registry object.",
    partnerAsk:
      "Approve parser versioning, user consent, and governance-safe auto-cover UX.",
  },
  {
    protocol: "Bucket",
    lane: "Stablecoin confidence cover",
    readiness: "design-ready",
    risk: "Peg confidence and redemption liquidity must be legible to users.",
    integration: "Publish a protocol passport and expose covered vault state.",
    proof:
      "Walrus receipts can preserve risk snapshots and governance decisions.",
    coveredExposure:
      "Stablecoin holders and treasury buckets exposed to peg drift.",
    trigger:
      "Peg breach, redemption depth stress, or oracle confidence threshold.",
    requiredEvidence:
      "Issuer metadata, circulating exposure, redemption liquidity, policy state.",
    policyStorage:
      "Issuer or vault-level passport points to active policy IDs and cover caps.",
    partnerAsk:
      "Define accepted peg oracle and redemption-liquidity disclosure fields.",
  },
  {
    protocol: "Scallop",
    lane: "Treasury and market protection",
    readiness: "target",
    risk: "Large pools need bounded tail-risk disclosure and optional user cover.",
    integration: "Add a quote widget and keeper-monitored claim path.",
    proof: "Risk index rows become the public integration checklist.",
    coveredExposure:
      "Market-level deposit exposure and user-selected cover buckets.",
    trigger:
      "Configured depeg, collateral drawdown, or liquidity stress event.",
    requiredEvidence:
      "Market object, supported asset list, utilization, policy object.",
    policyStorage:
      "Market passport records active cover products and user opt-in policies.",
    partnerAsk:
      "Pick one pilot market and expose read-only utilization/object references.",
  },
  {
    protocol: "Wallets",
    lane: "User risk warnings",
    readiness: "design-ready",
    risk: "Users see assets and positions without seeing available protection.",
    integration: "Display covered/uncovered state and link to Backstop quote.",
    proof: "Static proof API gives wallets a no-backend integration surface.",
    coveredExposure:
      "Wallet holdings, LP receipts, and lending positions with available cover.",
    trigger:
      "No automatic claim trigger; wallet surfaces quote and proof entrypoints.",
    requiredEvidence:
      "Token balance, protocol position object, Backstop proof API response.",
    policyStorage:
      "Wallet stores no policy state; it links owned policy objects and proof URLs.",
    partnerAsk:
      "Add covered/uncovered labels and deep links into `/depeg` quote state.",
  },
];

export const statusLabel = (status: RiskMarketStatus) => {
  if (status === "mainnet-live") return "Mainnet live";
  if (status === "integration-ready") return "Integration-ready";
  return "Research lane";
};

export const keeperStatusLabel = (status: KeeperOperationStatus) => {
  if (status === "public-now") return "Public now";
  if (status === "wallet-gated") return "Wallet-gated";
  if (status === "partner-gated") return "Partner-gated";
  return "Post-hackathon";
};
