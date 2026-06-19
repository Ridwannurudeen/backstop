# Backstop Deck Outline

Use `README.md` as the canonical source. Keep the deck narrow and proof-led.

1. **Backstop:** mainnet depeg cover for Sui DeFi.
2. **Problem:** Sui still lacks a native market backstop for depeg/bad-debt
   cascades; emergency validator intervention is not a primitive.
3. **Product:** Pyth-settled, fully-collateralized suiUSDe cover on mainnet —
   an early, low-cap experimental deployment with direct sales disabled (cover
   is bought only via a project-owned adapter).
4. **Live proof:** `/proof` packet with package IDs, pool IDs, verifier status,
   upgrade locks, custody transfer, active cover, staged mechanism-test claim,
   and SDK snippets.
5. **Risk lineage:** DeepBook Predict + Walrus testnet primitives show how this
   becomes a composable risk oracle.
6. **Honest limits:** no real production depeg payout yet, no external protocol
   integration yet, no external Move audit yet, and testnet disputes are
   admin-resolved today.
7. **Next:** external Move review, one real protocol integration,
   protocol-native cover, trust-minimized disputes.
