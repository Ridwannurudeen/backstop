# Backstop

**Solvency cover for Sui DeFi: Pyth-settled depeg protection with
DeepBook/Walrus risk-research lineage.**

Live app: https://backstop.gudman.xyz

Backstop protects Sui DeFi from depeg and bad-debt cascades before emergency
validator intervention is the only option. The shipped product is a
Pyth-settled, SUI-collateralized depeg-cover pool on Sui mainnet. DeepBook
Predict, SRX, RiskFeed, Walrus, and agent-accountability modules are live
testnet/research primitives behind that direction, not yet a fully trustless
production risk oracle.

## What is live

### Mainnet: Pyth-settled depeg cover

`contracts/pyth_cover_pool` is the production wedge:

- fully collateralized: pool funds must cover all outstanding policy liabilities
- settles against Pyth on-chain with freshness, confidence-band, activation-delay,
  and dwell requirements
- duration-scaled, utilization-priced premiums, max policy term, exposure caps,
  treasury fee, keeper bounty, pause-exempt claims, timelocked bounded parameter
  updates, and permissionless expired-policy cleanup
- wallet-connected `/depeg` app flow for LP deposit/withdraw, cover buy,
  breach record, claim, and owned positions
- mainnet proof-health card checks package existence, production pool state,
  DEP_ONLY upgrade locks, AdminCap custody transfer, archived staged
  mechanism-test claim evidence, and current production active cover

The default mainnet pool is the v4 low-cap deployment from 2026-06-19, so fresh
Pyth sale checks, required-premium charging with excess refunds, zero-share LP
protection, pool-epoch-only direct latch compatibility, bounded dwell
confirmation, healthy-observation reset, settlement-term immutability while
cover is active, duration pricing, max term, bounded governance, and
permissionless expiry sweeping are live on the public `/depeg` route. Keep caps
low: v4 is experimental and should not be marketed as production-safe insurance.

Important honesty note: the paid mainnet claim in `deployment.json` is archived
v3 staged mechanism-test evidence using a proof pool with intentionally
permissive trigger parameters. It proves the buy -> dwell -> claim path can pay
on-chain; it is not a real production depeg event and is not a v4 payout proof.
The current v4 `.985` pool has active cover and retained premium while suiUSDe
remains above the floor.

### Testnet: risk-oracle research layer

These pieces are deployed and useful for the broader roadmap, but should be
described as testnet/research surfaces:

- DeepBook Predict quote reads: binary prices become market-implied probability
  of failure
- SRX: risk-index readings from the Predict CDF, with Walrus evidence
- RiskFeed and RiskGuard: on-chain probability feed and a consumer that gates
  actions on the feed
- Agent decisions: a CLI underwriter logs decisions to Walrus and can execute
  small testnet supplies when funded
- Calibration ledger / arena: agent-accountability proofs with admin-resolved
  settlement today

The legacy `contracts/cover_pool` lane is not a production surface. It settles
against the latest RiskFeed reading without challenge finality, so the public app
does not expose it as a normal route.

## What is not live yet

- USD/stable collateral or oracle-haircut accounting for SUI/USD basis risk
- trust-minimized dispute resolution for RiskFeed/SRX/accountability
- an external protocol integration or non-project user buying/consuming cover
- independent Move review of the corrected v4 deployment

## App surfaces

- **Cover** (`/depeg`): flagship mainnet depeg-cover cockpit.
- **Proof** (`/proof`): live package, pool, custody, upgrade-lock, archived
  staged-claim, active-cover, and SDK integration packet.
- **Risk Feed** (`/markets/*`): public SRX and Predict-derived risk views.
- **Agent Proofs** (`/agent/*`): public agent decision/accountability proofs.
- **DeepBook Lab** (`/lab/*`): legacy testnet Predict flows; useful proof of
  lineage, not the main product.

## Protocol Integration In 2 Minutes

Backstop is easiest to integrate as a position-native cover rail:

1. Read a user's NAVI/Suilend-style position and compute USDe-family net exposure.
2. Convert that exposure into a SUI payout amount using Pyth SUI/USD.
3. Read the production pool and quote duration-priced premium.
4. Build the current v4 buy PTB with `buildDepegBuyCoverWithPythTx`, which
   refreshes Pyth and passes the resulting `PriceInfoObject` in the same
   transaction.
5. Run a keeper that calls `record_pool_breach` during a sustained depeg and
   `claim_latched` after the dwell confirms. Per-policy `record_breach` remains
   only as a compatibility path around pool-epoch eligibility.

Start with:

- `INTEGRATION.md` for SDK and direct PTB examples.
- `DEPLOYMENTS.md` for what is actually live versus source-only.
- `SECURITY.md` and `THREAT_MODEL.md` for current risk boundaries.
- `/proof` for live package IDs, pool IDs, custody, upgrade lock, archived
  staged-claim evidence, production active-cover evidence, and verifier status.
- `AUDIT_CHECKLIST.md` for the production Move review target.
- `OUTREACH.md` for partner-call framing; do not send it externally without
  explicit approval.

## Architecture

```text
app/       Vite + React + dapp-kit frontend.
agent/     Node/tsx scripts for Predict reads, Walrus logging, Pyth depeg
           provisioning, verification, and custody checks.
sdk/       TypeScript SDK source for npm packaging.
contracts/ pyth_cover_pool/      mainnet depeg-cover pool
           pyth_lending_demo/    reference lending consumer
           risk_feed/            testnet probability feed
           risk_index/           SRX index
           accountability/       calibration/passport proof objects
           cover_pool/           legacy testnet lane, not production-safe
```

Canonical IDs and transaction digests live in `deployment.json`.

## Run locally

```bash
cd app
npm install
npm run dev
```

The risk-feed/agent/testnet surfaces work without a wallet where possible. The
mainnet depeg actions require a Sui wallet and real SUI.

## Verification

```bash
npm run verify:readiness
```

This runs app typecheck/build, agent typecheck, SDK build, depeg integration
checks, depeg PTB `devInspect`, custody checks, and public proof checks.

Browser smoke:

```bash
npm --prefix app run smoke:depeg
npm --prefix app run smoke:depeg:wallet-gated
DEPEG_SMOKE_URL=https://backstop.gudman.xyz/depeg npm --prefix app run smoke:depeg
```

No-wallet monitor:

```bash
npm run monitor:depeg
```

## SDK

The SDK source builds locally in `sdk/`. Publishing a registry release with the
v4 constants is a separate approval-gated release step; the npm package may lag
this repository until that release is approved.

```bash
npm install @gudman/backstop-sdk @mysten/sui
```

## Roadmap

Recommended next build order:

1. Keep `/depeg` as the flagship product and keep legacy lab routes quarantined.
2. Get one real NAVI/Suilend-style protected position or one external protocol
   consuming the feed.
3. Complete external Move review before raising caps.
4. Replace admin-resolved disputes with a trust-minimized optimistic dispute game.

## Submission framing

Lead with:

> Backstop protects Sui DeFi from depeg and bad-debt cascades before validators
> need emergency intervention.

Then show:

1. live mainnet Pyth price and production pool
2. wallet-connected buy/LP/position flow
3. proof-health checks and staged mechanism-test claim
4. DeepBook/Walrus risk-oracle lineage
5. roadmap to protocol-native cover and trust-minimized dispute resolution
