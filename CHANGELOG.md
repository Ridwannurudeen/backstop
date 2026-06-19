# Changelog

## Unreleased

- Hardened `pyth_cover_pool` source for the next deployment:
  - fresh Pyth sale check in `buy_cover`
  - sale cutoff buffer above the claim threshold
  - required-premium charging with excess refunds
  - zero-share LP deposit rejection
  - pool-epoch-only direct latch compatibility path
  - one keeper bounty per pool epoch
  - bounded confirmation window for dwell arms
  - healthy observation reset for open epochs
  - blocked settlement-term changes while cover or an epoch is active
- Added regression tests for the audit findings:
  - `buy_during_unarmed_depeg_rejected`
  - `direct_latch_cannot_bypass_epoch_eligibility`
  - `two_unrelated_dips_do_not_confirm`
  - `active_policy_terms_are_immutable`
  - `policy_splitting_cannot_multiply_bounty`
  - `deposit_cannot_mint_zero_shares`
  - `excess_premium_is_refunded`
- Switched the default app, SDK, and agent buy builders to the v4 Pyth sale path
  that refreshes Pyth and passes the resulting `PriceInfoObject`.
- Deployed corrected v4 low-cap packages and pool to Sui mainnet:
  - cover package `0x4f8d00eb76a59996a0c88f3d103e950e6e4c02132acb8483cc8e1450005f04e9`
  - lending package `0x25f89307f0e37079a8cd7be1aa10f216f1bf3d5b00c2184ea2b8bc9ffc51a670`
  - production pool `0xd739a318705fb8b8401da34a3c2c3cde6397d033d72f793153ea673216eb58ed`
  - active-cover buy digest `Fk1hB7nsaYm5ZDww1sXwohHNYjcc3kmkd3qqUeFVdqwg`
- Locked both corrected UpgradeCaps to `DEP_ONLY` and transferred the production
  AdminCap to custody.

## 2026-06-19

- Merged v3 depeg cover desk branch to `main` through PR #37.
- Deployed merged static app to `https://backstop.gudman.xyz`.
- Prepared SDK v4 constants locally; npm publication remains approval-gated.
