# Backstop - Submission Notes

Use `README.md` as the canonical source. This file is intentionally short so it
does not drift from the live product.

## One-liner

Backstop turns Sui payments into protected financial objects: a payment can
settle with fresh depeg-risk checks and recipient-owned cover attached.

## What to submit

- Live app: https://backstop.gudman.xyz
- Repo: github.com/Ridwannurudeen/backstop
- Primary product: SafePay plus mainnet Pyth-settled suiUSDe depeg cover
- Supporting proof: DeepBook Predict risk-feed lineage, SRX, Walrus evidence,
  agent/accountability testnet proofs

## Not just stablecoins

The cover contract is asset-agnostic: `DepegCoverPool<T>` is generic over the
collateral coin, and the insured Pyth feed, exponent, and threshold are pool
parameters - nothing is hardcoded to a stablecoin (only comments use suiUSDe as
the example). The primitive is "pay out if a Pyth-priced asset falls at or below
a chosen floor." For a $1 stablecoin that is depeg cover (live today on
suiUSDe); for a volatile asset (BTC, ETH, SUI, LSTs) the same contract is crash
/ downside cover with the floor set below spot. Covering a new asset is a pool
creation with that feed id + threshold (`create_and_share`) - config, not new
code - given a live Pyth feed on Sui mainnet.

## Live vs roadmap

- **Live on mainnet:** `pyth_cover_pool`, production pool, open direct-sale
  pool, SafePay protected-payment PTB, wallet-connected `/depeg` actions,
  proof-health checks, custody/upgrade-lock evidence, active production cover,
  duration-priced v6 economics, permissionless expiry sweeping, pool-level depeg
  epochs, and a staged mechanism-test claim.
- **Live on testnet:** DeepBook Predict quote reads, SRX, RiskFeed/RiskGuard,
  agent decisions, calibration ledger, and arena.
- **Roadmap:** external Move review, protocol integrations, multi-asset cover,
  and a trust-minimized dispute game.

## Language guardrails

- Do not call the testnet RiskFeed/accountability system fully trustless; dispute
  resolution is admin-resolved today.
- Do not present the staged 1.05 proof pool as a real depeg event. It is a
  mainnet mechanism test.
- Do not treat the legacy `cover_pool` lane as production-safe.
