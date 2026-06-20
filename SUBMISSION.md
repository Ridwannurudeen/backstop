# Backstop - Submission Notes

Use `README.md` as the canonical source. This file is intentionally short so it
does not drift from the live product.

## One-liner

Backstop protects Sui DeFi from depeg and bad-debt cascades before validators
need emergency intervention.

## What to submit

- Live app: https://backstop.gudman.xyz
- Repo: github.com/Ridwannurudeen/backstop
- Primary product: mainnet Pyth-settled suiUSDe depeg cover
- Supporting proof: DeepBook Predict risk-feed lineage, SRX, Walrus evidence,
  agent/accountability testnet proofs

## Live vs roadmap

- **Live on mainnet:** `pyth_cover_pool`, production pool, wallet-connected
  `/depeg` actions, proof-health checks, custody/upgrade-lock evidence, active
  production cover, duration-priced v6 economics, permissionless expiry
  sweeping, pool-level depeg epochs, and a staged mechanism-test claim.
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
