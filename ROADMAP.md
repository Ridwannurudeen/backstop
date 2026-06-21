# Backstop Roadmap

The vision: **Backstop becomes the risk layer for money on Sui** - any asset can
be protected, any payment can carry its own risk controls, and any protocol or
wallet can embed cover as a composable object. Stablecoin depeg cover is the
first product; the same primitive generalizes to every Pyth-priced asset and,
eventually, to money that protects itself.

Use `README.md`, `DEPLOYMENTS.md`, `SECURITY.md`, and `THREAT_MODEL.md` as the
canonical state documents. This file is the forward sequence. Honest framing:
near-term phases are concrete and funded by what already works on mainnet; later
phases are directional and gated on real demand and review.

## Phase 0 - Live today (mainnet)

- Pyth-settled depeg cover on suiUSDe, fully collateralized, with sustained-breach
  dwell, activation delay, confidence-band settlement, claim-exempt pause, and
  timelocked governance.
- **SafePay**: a payment that buys cover and delivers payment + policy to the
  recipient in one atomic PTB - proven on-chain.
- Open direct-sale pool, underwriting, claim, and a public proof packet.

## Phase 1 - Harden and integrate

- Independent Move review (OpenZeppelin / OtterSec) published with fixes.
- Raise caps from the experimental low-cap pool after review + connected-wallet
  smoke at scale.
- Protect one real position end-to-end (NAVI, Suilend, Scallop, Bucket, or a
  treasury): bind cover to verified exposure, route payouts into the position or
  reserve.
- Run at least two independent keeper operators; monitor oracle age/confidence,
  pool solvency, epoch state, and governance.

## Phase 2 - Any asset, not just stablecoins

- Generalize from suiUSDe depeg to **downside / crash cover on any Pyth-priced
  asset** - BTC, ETH, SUI, and liquid-staking tokens. The contract is already
  asset-agnostic (`DepegCoverPool<T>`, feed + threshold are pool parameters), so
  this is pool creation and risk calibration, not new core code.
- Stable-collateral pools (USDC) alongside SUI collateral, with oracle valuation,
  haircuts, and concentration limits for meaningful USD exposure.
- A multi-asset risk terminal: live floors, implied breach probabilities, and
  pool solvency across every covered market.

## Phase 3 - SafePay as a payments rail

- Ship a **SafePay SDK + embeddable widget** so any wallet, payroll tool, merchant
  checkout, or DAO treasury can attach cover to a transfer in one call.
- Protected payroll and treasury transfers: pay people in stable value without
  forcing them to absorb depeg risk; the payment refuses to settle into an asset
  that is breaching.
- Conditional settlement modes: settle-if-healthy, attach-cover, or hold-until-
  recovery - money with embedded risk rules.

## Phase 4 - Self-insuring money

- Yield-funded perpetual cover: deposit once, the position earns yield, and a slice
  of that yield streams as premium to keep cover always-on and auto-renewing.
- Composable "protected" wrappers other protocols mint on top of, so a balance,
  an LP position, or a vault share carries protection by default.

## Phase 5 - Risk OS for Sui

- An open risk marketplace: any protocol lists a risk, any LP underwrites it,
  priced by an on-chain risk index (SRX lineage) and reputation-weighted capacity.
- Risk receipts for position-bound policies; deterministic models set bounded
  rates and capacity, with LLMs limited to explanation, reporting, and operator
  assistance.
- Decentralize the feed and dispute path; prepare Pyth Core migration ahead of the
  post-July-31-2026 package change; extend cover cross-chain via Pyth where Backstop
  liquidity can settle.
