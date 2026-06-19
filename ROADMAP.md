# Backstop Roadmap

Use `README.md`, `DEPLOYMENTS.md`, `SECURITY.md`, and `THREAT_MODEL.md` as the
canonical state documents. This file is only the forward sequence.

## Phase 1 - Correct The Depeg Pool

- Keep the deployed v3 pool low-cap and explicitly experimental.
- Publish a reviewed v4 package only after the source-hardening changes pass:
  sale-open Pyth checks, exact premium, zero-share rejection, pool-epoch
  settlement, bounded dwell confirmation, and immutable live settlement terms.
- Run connected-wallet smoke against the corrected package before raising caps.

## Phase 2 - Prove One Integration

- Protect one real NAVI, Suilend, Scallop, Bucket, or treasury position.
- Bind cover size to verified exposure and route payouts into the position or
  protocol reserve where possible.
- Use `/depeg` and `/proof` as the demo path; keep DeepBook/Walrus routes as
  supporting evidence, not the main product.

## Phase 3 - Stable Collateral

- Deploy a USDC or conservative stable-collateral pool before taking meaningful
  USD-denominated exposure.
- If SUI collateral remains supported, add oracle valuation, haircuts,
  concentration limits, and explicit stress accounting.

## Phase 4 - Operations And Review

- Complete independent Move review and publish findings/fixes.
- Run at least two independent keeper operators.
- Monitor oracle age, confidence, pool solvency, epoch state, governance
  proposals, and keeper inactivity.
- Prepare Pyth Core migration work before relying on post-July 31, 2026 package
  assumptions.

## Phase 5 - RiskOS

- Build a Sui risk graph only after the depeg product has a real design partner.
- Add risk receipts for position-bound policies.
- Let deterministic models set bounded rates and capacity; use LLMs only for
  explanation, reporting, and operator assistance.
