# Backstop Demo Script

Use the `/depeg` page as the spine. Do not lead with the abstract risk-layer
claim; earn that after showing the mainnet product.

## 0:00-0:30 - Problem

Sui's emergency backstop today is social/governance intervention. Backstop starts
with a concrete primitive: mainnet depeg cover for stablecoin exposure.

## 0:30-2:00 - Mainnet cover

Open `https://backstop.gudman.xyz/depeg`.

Show:

- live Pyth suiUSDe price and adverse band
- production pool TVL, headroom, utilization, floor, dwell, activation
- quote for cover and premium
- your active LP share and active cover policy if available

Say that the production pool is live and active, but the paid claim proof is a
staged mechanism test, not a real production depeg.

## 2:00-3:00 - Wallet action

If recording with a funded wallet, do one small live action:

- deposit a small LP amount, or
- buy a small cover amount

Show the digest and the updated position list. Do not force a claim unless the
real Pyth conditions qualify.

## 3:00-4:00 - Proof packet

Open `https://backstop.gudman.xyz/proof` and show:

- packages published
- production and staged pool IDs
- production pool live
- DEP_ONLY upgrade locks
- AdminCap custody transfer
- staged mechanism-test claim
- production active cover
- SDK snippets for quote, buy, record breach, and claim

## 4:00-4:40 - Risk-feed lineage

Open Risk Feed and Agent Proofs. Explain that these are testnet/research
surfaces: DeepBook Predict supplies a market-implied probability-of-failure
surface, Walrus stores evidence, and the next step is making disputes
trust-minimized and getting protocols to consume the feed.

## 4:40-5:00 - Close

Backstop protects Sui DeFi from depeg and bad-debt cascades before validators
need emergency intervention. The shipped wedge is mainnet depeg cover; the
roadmap is a composable risk oracle that protocols actually consume.
