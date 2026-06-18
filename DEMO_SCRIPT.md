# Backstop Demo Script

Target length: 2-4 minutes.

## 0:00-0:20 Thesis

Open: https://backstop.gudman.xyz/submission

Say:

Backstop is the DeepBook-priced cover desk for Sui DeFi. If DeepBook is Sui's
liquidity layer, Backstop is the risk layer built on top of it: priced cover,
keeper-readable policy state, protocol adapters, and public proof receipts.

## 0:20-0:55 Proof First

Open: https://backstop.gudman.xyz/proof

Show:

- Mainnet depeg package.
- Mainnet depeg pool.
- Active policy object.
- Proof health.
- Mainnet lifecycle panel.
- Keeper dry-run monitor.
- Testnet staged claim replay only as an isolated research artifact.

Say:

This is not just a frontend. The proof center reads the actual Sui objects. The
production lane is mainnet and the lifecycle panel avoids claiming payout state
unless it is visible from the object fields. The older DeepBook/Walrus research
lane stays isolated on testnet. The keeper panel reads the same mainnet pool,
price, and policy state, then labels which actions are public reads versus
wallet-gated transactions.

## 0:55-1:35 Cover Desk

Open: https://backstop.gudman.xyz/depeg

Show:

- Live suiUSDe price.
- Pool capital.
- Outstanding cover.
- Cover amount.
- Term.
- Premium.
- Max payout.

Say:

This is the first live market: suiUSDe depeg cover. The buyer pays a premium,
the pool tracks outstanding cover, and valid claims require the Pyth-settled
dwell-and-latch path instead of a discretionary payout.

If doing a live wallet action, use a tiny amount.

## 1:35-2:15 Protocol Kit

Open: https://backstop.gudman.xyz/protocol

Show:

- Quote depeg cover snippet.
- Buy cover PTB snippet.
- Record breach snippet.
- Claim latched policy snippet.
- NAVI/Suilend adapter pattern.
- Adapter evidence boundary.

Say:

The real wedge is protocol integration. NAVI, Suilend, wallets, and treasury
tools should not each rebuild insurance mechanics. They can quote, buy, record,
claim, and verify Backstop policies through the SDK. For NAVI and Suilend, the
adapter contract is explicit about the object evidence needed. Suilend now has
a sample-validated obligation parser and consented pilot; NAVI still needs a
confirmed account or vault object sample.

## 2:15-2:55 Risk Clearinghouse

Open: https://backstop.gudman.xyz/risk-index

Show:

- SRX methodology.
- Keeper operations.
- suiUSDe live market.
- SUI drawdown.
- Stablecoin basket.
- Lending collateral.
- LP tail risk.

Say:

The hackathon product is one live cover market plus the rails to scale. The
post-hackathon direction is a Sui risk clearinghouse: LP vaults, keeper rewards,
wallet warnings, protocol passports, and a DeepBook hedge router.

## 2:55-3:15 Close

Open: https://backstop.gudman.xyz/api/proof.json

Say:

Backstop makes risk inspectable, priced, and settleable. It gives Sui DeFi the
missing layer between market liquidity and user trust.

## Hard Boundaries

- Mainnet depeg cover is live but unaudited.
- Use small amounts in any wallet demo.
- Keeper execution is wallet-gated; the public monitor is dry-run.
- Suilend has sample-validated parsing and a consented pilot route, not
  production auto-cover.
- NAVI remains a spec until a partner object sample is confirmed.
- DeepBook Predict and agent underwriting are research lanes until the next
  production pool rollout.
- Submission requires explicit human approval before final submission.
