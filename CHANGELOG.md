# Changelog

## Unreleased

- Hardened `pyth_cover_pool` source for the v5 deployment:
  - fresh Pyth sale check in `buy_cover`
  - sale cutoff buffer above the claim threshold
  - required-premium charging with excess refunds
  - zero-share LP deposit rejection
  - pool-epoch-only direct latch compatibility path
  - one keeper bounty per pool epoch
  - bounded confirmation window for dwell arms
  - healthy observation reset for open epochs
  - blocked settlement-term changes while cover or an epoch is active
  - direct wallet sales disabled by default
  - pool-scoped `BuyerCap` purchases for protocol adapters
- Added regression tests for the audit findings:
  - `buy_during_unarmed_depeg_rejected`
  - `direct_latch_cannot_bypass_epoch_eligibility`
  - `two_unrelated_dips_do_not_confirm`
  - `active_policy_terms_are_immutable`
  - `policy_splitting_cannot_multiply_bounty`
  - `deposit_cannot_mint_zero_shares`
  - `excess_premium_is_refunded`
- Deployed v5 low-cap packages and BuyerCap-restricted pool to Sui mainnet:
  - cover package `0x49a4385606094ec78faa8b445372e8dd515dd0ddb513730a8ba9c4b734d5827c`
  - lending package `0xdbddf4df28aea4489f7979cc608bea4a599a6643f79bfe10cecca1cc06aabaa8`
  - production pool `0x55fe8bb8730c68931bbbcf876b7007d190febb04e2b82cccac7057868e83d8b1`
  - production lending market `0xda46848a368d5ea6c48f776fc233479c30ac807a1b1a2d5c0b59de11b3bac0c0`
  - active adapter-cover buy digest `GfEGXtLsJvdRCHakV7dNpq3BHvKuxBJV68tenEtcsNDR`
- Locked both v5 UpgradeCaps to `DEP_ONLY` and transferred the production
  AdminCap to custody. The v4 low-cap deployment is archived.
- Published `@gudman/backstop-sdk@0.1.2` with v5 mainnet constants and
  BuyerCap purchase helpers.

## 2026-06-19

- Merged v3 depeg cover desk branch to `main` through PR #37.
- Deployed merged static app to `https://backstop.gudman.xyz`.
- Archived older SDK release notes; `0.1.2` is now the npm `latest` tag.
