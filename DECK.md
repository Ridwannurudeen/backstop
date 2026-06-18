# Backstop Pitch Deck

Status: mainnet cover lane live; research lanes isolated.

Primary track: Sui Overflow 2026 / DeepBook specialized track.

## Slide 1: Backstop

The DeepBook-priced cover desk for Sui DeFi.

- Mainnet suiUSDe depeg cover.
- Public proof center.
- Keeper-readable lifecycle.
- Protocol adapter path.
- SRX risk index for expansion markets.

## Slide 2: Problem

Sui has deep liquidity and fast execution, but risk is not a product primitive.

- Users see risk warnings after exposure already exists.
- Protocols do not have a shared cover layer.
- Emergency governance and socialized losses are not scalable risk management.
- Stablecoins, lending positions, and LP positions need explicit cover markets.

## Slide 3: Product

Backstop turns risk into a transaction flow.

- Quote cover.
- Buy policy object.
- Monitor Pyth and pool state.
- Record sustained breach.
- Claim latched policy.
- Sweep expired policy.
- Publish proof receipts.

## Slide 4: Live proof

Mainnet evidence:

- Package:
  `0x761832702281966fac9dee6183b530d2f73ecd779524c61cd3dd4705fa6ec968`
- Pool:
  `0x5edc508a4258e1253563219049dadc8b068cf309115e29732dad71698c168592`
- Price object:
  `0x9b2028bfc829127d2e5ead1691dc3002de9e9b8d8076b4915e5ecc7d9b99d63f`
- Active policy:
  `0x3863ad1bf44904af1fcc3ead38589977378e6800e14ceacebf1205187ce695ec`

Show `https://backstop.gudman.xyz/proof`.

## Slide 5: Keeper operations

Backstop does not hide behind a black-box claims process.

- Public monitor reads pool, price, and policy state.
- Breach recording is wallet-gated.
- Dwell confirmation and claim are wallet-gated.
- Expiry sweep is wallet-gated.
- Protocol exposure sync is partner-gated.

Boundary: no keeper-run log is claimed until an exact signed transaction digest
exists.

## Slide 6: Protocol integration

Backstop should feel like Stripe for Sui risk.

- Wallet quote widget.
- Protocol-owned adapter service.
- Public risk passport.
- SDK/PTB snippets for quote, buy, record, claim, and sweep.

First adapter specs:

- NAVI borrower or vault exposure.
- Suilend LendingMarket / Reserve / Obligation exposure.

## Slide 7: DeepBook role

DeepBook is the market layer that makes the clearinghouse defensible.

- Predict surfaces calibrate crash probability.
- DeepBook liquidity depth gates capacity and hedge budget.
- Risk markets become priced and auditable instead of hidden governance
  promises.
- The hedge router turns market depth into underwriting limits.

## Slide 8: SRX risk index

SRX ranks cover markets by:

- Oracle integrity.
- DeepBook liquidity and hedge depth.
- Volatility or peg drift.
- Protocol concentration.
- Proof readiness.

Current lanes:

- suiUSDe depeg cover: mainnet live.
- SUI drawdown cover: integration-ready.
- Stablecoin basket failure: integration-ready.
- Lending collateral shock: research lane.
- LP tail-risk cover: research lane.

## Slide 9: Moat

The moat is not a UI.

- Mainnet policy mechanics.
- Public proof API.
- Keeper-readable state.
- Protocol adapter contract.
- Risk passports.
- SRX scoring.
- DeepBook hedge budget.
- Eventually, a provable operating history of claims, sweeps, and cover usage.

## Slide 10: Close

Backstop is the missing risk layer between Sui liquidity and user trust.

The hackathon deliverable is one real mainnet cover market plus the rails to
scale into a Sui risk clearinghouse.
