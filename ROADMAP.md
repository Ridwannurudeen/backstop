# Backstop Roadmap

Backstop is the DeepBook-priced cover desk and risk clearinghouse for Sui DeFi.

Current status: one mainnet lane is live for suiUSDe depeg cover, and the older
DeepBook Predict / Walrus / RiskFeed work remains an isolated research lane. Do
not describe the project as testnet-only.

## What is live now

- Mainnet Sui package:
  `0x761832702281966fac9dee6183b530d2f73ecd779524c61cd3dd4705fa6ec968`
- Mainnet depeg pool:
  `0x5edc508a4258e1253563219049dadc8b068cf309115e29732dad71698c168592`
- Pyth PriceInfo object:
  `0x9b2028bfc829127d2e5ead1691dc3002de9e9b8d8076b4915e5ecc7d9b99d63f`
- Active policy example:
  `0x3863ad1bf44904af1fcc3ead38589977378e6800e14ceacebf1205187ce695ec`
- Public proof:
  `https://backstop.gudman.xyz/proof`
- Public APIs:
  `https://backstop.gudman.xyz/api/proof.json`,
  `https://backstop.gudman.xyz/api/risk-index.json`,
  `https://backstop.gudman.xyz/api/submission.json`

## Strategic thesis

Sui has fast execution and DeepBook liquidity, but risk is still handled through
warnings, socialized losses, or emergency governance. Backstop turns that risk
into a product surface:

- Quote cover.
- Buy policy objects.
- Monitor oracle and policy state.
- Latch sustained breaches.
- Claim valid policies.
- Sweep expired policies.
- Bind cover to protocol positions.
- Publish proof receipts users and protocols can inspect.

DeepBook matters because it is the market layer for Sui risk. The current
production lane uses Pyth-settled depeg cover; DeepBook Predict and liquidity
depth are the expansion rails for crash curves, capacity limits, and hedge
budgets.

## Phase 0: Proof and cover desk

Status: live.

Ships:

- Mainnet suiUSDe depeg pool.
- No-wallet quote simulator.
- Wallet buy flow.
- Treasury cover planner.
- LP supply flow.
- Owned policy view with claim and expiry builders.
- Proof center with package, pool, policy, lifecycle, and research-lane rows.
- SDK/PTB examples in the protocol kit.

Boundary:

- Mainnet pool is unaudited.
- Use small amounts until external review and liquidity policy are complete.
- The app passes current mainnet IDs from `app/src/lib/proofData.ts`; npm
  `@gudman/backstop-sdk@0.1.0` exported deployment constants are stale until a
  new SDK release is approved and published.

## Phase 1: Keeper operations

Status: public dry-run monitor live; execution is wallet-gated.

Ships now:

- Pool solvency watch.
- Pyth price and trigger watch.
- Policy action derivation.
- Explicit dry-run versus execute boundary in `/proof`.

Next:

- Fund a keeper signer.
- Publish signed breach observation receipts.
- Publish signed dwell confirmation and claim receipts.
- Publish signed expiry sweep receipts.
- Add reward accounting for keeper work.

## Phase 2: Protocol adapters

Status: adapter contract live in the app; production parser needs partner object
samples.

First targets:

- NAVI account or vault exposure.
- Suilend LendingMarket / Reserve / Obligation exposure.

Adapter evidence must normalize:

- `protocol`
- `account`
- `positionId`
- `assetType`
- `coverMist`
- `riskBudgetMist`
- `evidence`
- `policyId`

Boundary:

- NAVI and Suilend are not live production integrations yet.
- Backstop needs confirmed object samples, user consent path, and governance
  caps before claiming account-level cover validation.

## Phase 3: Multi-market clearinghouse

Target lanes:

- SUI drawdown cover.
- Stablecoin basket failure cover.
- Lending collateral shock cover.
- LP tail-risk cover for DeepBook, Cetus, and Turbos style positions.

The SRX index ranks which lanes are ready by oracle integrity, DeepBook
liquidity and hedge depth, volatility or peg drift, protocol concentration, and
proof readiness.

## Phase 4: DeepBook hedge router

Goal: convert DeepBook and Predict signals into underwriting limits and hedge
budgets.

The router should:

- Gate max cover by liquidity depth.
- Track crash curve movement.
- Budget pool exposure across depeg, drawdown, and LP-tail markets.
- Publish hedge-budget receipts to the proof API.

## Phase 5: Risk clearinghouse network

Goal: make Backstop a Sui-native risk layer protocols, wallets, LPs, and
treasuries can depend on.

Long-term products:

- Risk-class LP vaults.
- Protocol passports.
- Wallet covered/uncovered warnings.
- Keeper rewards and reputation.
- Transferable or composable cover policies.
- Institutional proof reports.
- Agent underwriting receipts tied to real pool capacity.

## Hard boundaries

- No hackathon submission without explicit user approval.
- No claim of live NAVI/Suilend validation until real object parsers are built.
- No claim of paid mainnet claim unless an exact digest and policy state prove it.
- No claim that the SDK constants are current until the next npm release is
  published.
