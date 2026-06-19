# Backstop Roadmap

Use `README.md` as the canonical state document. This file is the forward plan.

## Phase 1 - Flagship depeg product

- Keep `/depeg` as the main app surface.
- Keep legacy DeepBook Predict flows quarantined under `DeepBook Lab`.
- Present the staged 1.05 proof pool as a mechanism test only.

## Phase 2 - Contract economics

- Live on mainnet v3: duration-scaled premium and max policy term.
- Live on mainnet v3: permissionless expired-policy cleanup.
- Live on mainnet v3: bounded governance parameter ranges.
- Add explicit SUI/USD basis-risk disclosure and consider stable collateral or
  oracle-haircut accounting.

## Phase 3 - Incident-scale settlement

- Live on mainnet v3: pool-level depeg epochs for batchable claim eligibility,
  with keeper monitor and UI/SDK wiring.
- Gate before raising caps: external Move review and connected-wallet smoke on
  the production pool.

## Phase 4 - Protocol demand

- Protect one real NAVI/Suilend-style position.
- Get one external protocol or external wallet to buy/consume cover.
- Package a proof page that shows the production pool, proof-health checks,
  active cover, and relevant txs.

## Phase 5 - Risk oracle

- Replace admin-resolved challenges with a trust-minimized optimistic dispute
  game.
- Publish a continuously updated probability-of-failure feed that protocols can
  consume for LTVs, liquidation parameters, reserves, or cover requirements.

## Phase 6 - Scale

- Multi-asset depeg markets.
- Protocol-native cover bundles.
- Yield-bearing underwriting capital.
- Agent underwriter marketplace once calibration has meaningful sample size.
