# Changelog

## Unreleased

- Hardened `pyth_cover_pool` source for the next deployment:
  - fresh Pyth sale check in `buy_cover`
  - sale cutoff buffer above the claim threshold
  - exact premium requirement
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
  - `excess_premium_is_rejected`
- Kept the default app, SDK, and agent buy builders compatible with the live v3
  deployment, and added explicit v4 buy builders that refresh Pyth and pass the
  resulting `PriceInfoObject`.

## 2026-06-19

- Merged v3 depeg cover desk branch to `main` through PR #37.
- Deployed merged static app to `https://backstop.gudman.xyz`.
- Published `@gudman/backstop-sdk@0.1.1`.
