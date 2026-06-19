# Threat Model

## Production Candidate

The production candidate is the Pyth-settled `pyth_cover_pool` for suiUSDe
depeg cover. DeepBook, RiskFeed, SRX, Walrus, and agent-accountability modules
are research/supporting surfaces and must not control production payouts.

## Assets To Protect

- LP principal in `funds`.
- Outstanding policyholder cover.
- Integrity of pool epoch state.
- Integrity of immutable policy terms.
- AdminCap custody and UpgradeCap policy.
- Accuracy and freshness of the Pyth feed used for settlement.

## Hardening Added In This Branch

- Cover purchase now requires a fresh Pyth read and rejects sales whose lower
  confidence edge is too close to the depeg floor.
- `buy_cover` refunds excess premium instead of accepting donations that can
  distort share price.
- LP deposits abort if they would mint zero shares.
- Direct per-policy `record_breach` no longer creates an independent payout
  state machine; it routes through the pool epoch eligibility rules.
- Keeper bounty is paid once per pool epoch, not once per policy.
- A pool arm expires if it is not confirmed within the bounded confirmation
  window.
- A healthy supplied observation resets an open pool epoch.
- Settlement parameters cannot be proposed or executed while outstanding cover
  or an open epoch exists.
- v5 pools default to disabled direct wallet sales, protocol adapters buy
  through a pool-scoped `BuyerCap`, and the reference lending adapter supports
  generic collateral for a future stable pool.
- RiskFeed default readers now reject challenged readings; analytics and dispute
  dashboards must opt into the explicit unchecked read.

## Remaining Material Risks

- SUI collateral does not hedge USD loss during correlated SUI/suiUSDe stress.
- v5 is BuyerCap-restricted, but the reference adapter is still project-owned;
  external protocol integration and exposure verification remain unproven.
- The production pool has not had independent Move review.
- RiskFeed and SRX are not production settlement oracles; challenged reads are
  safer by default now, but the feed still lacks quorum aggregation,
  trust-minimized dispute finality, and value-at-risk-sized bonds.
- Governance remains centralized around AdminCap custody.
- Pyth Core migration work is required before relying on post-upgrade package
  assumptions after July 31, 2026.

## Non-Goals For The Next Deployment

- No token.
- No leveraged underwriting.
- No cross-chain expansion.
- No generalized agent marketplace.
- No increase in caps before review and a real design partner.
