# Backstop Submission

## One-liner

Backstop is the DeepBook-priced cover desk for Sui DeFi: users and protocols can
buy depeg protection, verify policy state, and integrate risk cover through a
mainnet Sui pool plus public proof receipts.

## Track

Primary track: DeepBook specialized track.

Supporting rails: Walrus for proof receipts and Agentic Web for underwriting
research. These are supporting surfaces, not the primary submission track.

## Live Links

- App: https://backstop.gudman.xyz
- Submission command center: https://backstop.gudman.xyz/submission
- Proof center: https://backstop.gudman.xyz/proof
- Cover desk: https://backstop.gudman.xyz/depeg
- Protocol kit: https://backstop.gudman.xyz/protocol
- Risk index: https://backstop.gudman.xyz/risk-index
- Proof JSON: https://backstop.gudman.xyz/api/proof.json
- Risk index JSON: https://backstop.gudman.xyz/api/risk-index.json
- Submission JSON: https://backstop.gudman.xyz/api/submission.json

## What To Demo

Use `DEMO_SCRIPT.md` for the timed recording.

1. Open `/submission` and state the thesis: if DeepBook is Sui's liquidity layer,
   Backstop is the risk layer built on top of it.
2. Open `/proof` and show mainnet package, pool, active policy lifecycle, and isolated research replay.
3. Open `/depeg`, connect a Sui mainnet wallet, quote a small suiUSDe depeg
   cover policy, and show the premium/payout relationship.
4. Open `/protocol` and show how a protocol can quote, buy, record breach, and
   claim through SDK/PTB builders.
5. Open `/risk-index` and show the roadmap from one live depeg pool into a risk
   clearinghouse: SUI drawdown, stablecoin basket, lending collateral, and LP
   tail-risk cover.

## Mainnet Evidence

- Package:
  `0x761832702281966fac9dee6183b530d2f73ecd779524c61cd3dd4705fa6ec968`
- Pool:
  `0x5edc508a4258e1253563219049dadc8b068cf309115e29732dad71698c168592`
- Pyth price object:
  `0x9b2028bfc829127d2e5ead1691dc3002de9e9b8d8076b4915e5ecc7d9b99d63f`
- Active policy example:
  `0x3863ad1bf44904af1fcc3ead38589977378e6800e14ceacebf1205187ce695ec`

## Keeper And Adapter Evidence

- `/proof` includes a public dry-run keeper monitor for pool, price, policy, and
  next-action derivation.
- Breach observation, claim, and expiry sweep are wallet-gated transaction
  builders, not claimed autonomous keeper logs.
- `/protocol` and `/risk-index` include NAVI and Suilend adapter specs grounded
  in their public lending concepts: account or vault evidence for NAVI, and
  LendingMarket / Reserve / Obligation evidence for Suilend.
- Production account-level integration requires one confirmed object sample and
  a consent/governance path from the partner protocol.

## Why It Should Win

Backstop is not another trader terminal or vault. It is protocol-grade risk
infrastructure: a cover market, a proof ledger, an SDK path, and a risk index.
It gives Sui DeFi a way to turn risk from a warning label into a priced,
settleable, auditable primitive.

## Current Boundaries

- Mainnet cover is live but unaudited.
- Use small policy and LP amounts during demo.
- Keeper execution is wallet-gated in this checkout; the public monitor is
  read-only.
- NAVI/Suilend adapters are not live production parsers yet.
- DeepBook Predict and agent underwriting surfaces are research lanes until the
  next pool rollout connects them to production cover capacity.
