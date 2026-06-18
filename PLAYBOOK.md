# Backstop Playbook

Canonical state lives in `README.md`.

## Verify

```bash
npm run verify:readiness
```

## Local app

```bash
cd app
npm install
npm run dev
```

## Live smoke

```bash
$env:DEPEG_SMOKE_URL='https://backstop.gudman.xyz/depeg'; npm --prefix app run smoke:depeg
```

## Demo order

1. `/depeg` production pool and Pyth price.
2. Small wallet action if funded.
3. `/proof` package IDs, pool IDs, custody, UpgradeCap lock, active cover,
   staged claim, verifier status, and SDK snippets.
4. Risk Feed and Agent Proofs as supporting research surfaces.
5. Live v3 hardening: duration pricing, expiry cleanup, max term, bounded
   governance, and pool-level depeg epochs; then protocol integration and
   trust-minimized disputes.

## Do not say

- Do not call the testnet RiskFeed/accountability lane fully trustless.
- Do not call the staged 1.05 pool a real depeg payout.
- Do not market the legacy `cover_pool` lane as production-safe.
