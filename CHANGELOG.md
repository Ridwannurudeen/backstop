# Changelog

## v6 audit hardening (deployed to mainnet)

Post-audit fixes; all tests green (130 across 11 packages). The v5 packages were
`DEP_ONLY`-locked and could not be upgraded in place, so these shipped as fresh
**v6** packages — now live on mainnet (deploy details below).

Mainnet money path:
- `pyth_cover_pool`: block LP deposits into a fully-drained pool (no silent zombie-share
  dilution); enforce production floors `min_dwell_secs >= 300` and
  `activation_delay_secs >= 300` (constructor + governance); freeze `withdraw_lp` during
  an armed/breached epoch (no intra-epoch LP bank run); add `reap_unclaimed_policy` so a
  confirmed-but-abandoned policy cannot lock LP capital past a 14-day claim window; widen
  `total_cover + cover` to u128 before the cap/solvency checks.
- `pyth_lending_demo`: add `release_expired_policy` (market no longer bricks after a
  policy expires un-breached) and cap-gated `withdraw_reserve` (reserve no longer
  permanently locked); `create_and_share` now mints a `MarketCap`.
- `provisionPythLending.ts`: removed the broken default `insure` PTB (it omitted the
  Pyth `PriceInfoObject` and dropped the refund coin); the Pyth-settled path is the only one.

Testnet research cryptoeconomics (hardened from confiscation tools into accountable mechanisms):
- `risk_guard`: `withdraw` now requires the treasury `owner` (was unauthenticated).
- `risk_feed` / `risk_index`: minimum challenge bond; challenger != resolver; slash capped
  to a fraction and routed to a neutral sink (not the challenger); `unstake` path;
  `risk_index::publish` can no longer overwrite a challenged reading.
- `arena`: immutable accuracy bar + settled-only denominator + min-settled gate; slashed
  funds routed to a neutral sink, not the admin.
- `passport`: minimum register bond; slashed stake locked, not paid to admin.
- `oracle_pool` / `cover_pool`: first-depositor share-inflation fixed (min initial
  liquidity + dead shares + non-zero-share guard).
- `pool_registry`: cap-gated `update`/`deprecate` so stale pool pointers are correctable.

App + docs honesty: neutralized inflated Landing fallbacks and the static "underwriting
receipt"; relabeled the Underwriter snapshot as point-in-time rules output; corrected
"trustlessly" / "autonomous AI underwriter" / "solvency cover" framing to match the
low-cap experimental reality.

Deployed v6 audit-hardened packages to Sui mainnet (fresh, since v5 was DEP_ONLY-locked) —
full ids in `deployment.json`:
- cover package `0x3ec3…ccb5`, lending package `0x729e…3b2e`
- production pool `0x1d9d…c523`, production lending market `0xf36d…b209`
- both v6 UpgradeCaps locked `DEP_ONLY`; production AdminCap transferred to custody
- published `@gudman/backstop-sdk@0.1.4` with v6 mainnet constants; redeployed the app

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
- Published `@gudman/backstop-sdk@0.1.3` with v5 mainnet constants and
  BuyerCap purchase helpers.

## 2026-06-19

- Merged v3 depeg cover desk branch to `main` through PR #37.
- Deployed merged static app to `https://backstop.gudman.xyz`.
- Archived older SDK release notes; `0.1.3` is now the npm `latest` tag.
