# RiskFeed — build, deploy, publish

`RiskFeed` is Backstop's on-chain probability-of-failure registry (Pillar I): an off-chain underwriter derives a market-implied probability from DeepBook Predict, proves the inputs on Walrus, and publishes the result here for any contract to read.

## Prerequisites
- Sui CLI (`sui`) — prebuilt binaries: https://github.com/MystenLabs/sui/releases (testnet build). Verify: `sui --version`.
- A testnet address with gas: `sui client faucet` (or https://faucet.sui.io). `sui client active-address` to see it.
- `sui client active-env` → `testnet`.

## 1. Build (compile-verify, no gas)
```
cd contracts/risk_feed
sui move build
```

## 2. Publish (needs gas)
```
sui client publish --gas-budget 100000000
```
From the output, capture three IDs:
- **Package ID** (the published package) → `RISK_FEED_PKG`
- **RiskFeed** shared object (`...::risk_feed::RiskFeed`) → `RISK_FEED_OBJ`
- **PublisherCap** owned object (`...::risk_feed::PublisherCap`) → `PUBLISHER_CAP`

## 3. Publish readings on-chain (from the agent)
The agent computes probabilities + Walrus proofs into `agent/out/decisions.json`. Anchor them:
```
cd ../../agent
$env:RISK_FEED_PKG="0x…"; $env:RISK_FEED_OBJ="0x…"; $env:PUBLISHER_CAP="0x…"
$env:SUI_PRIVATE_KEY="suiprivkey1…"   # the funded publisher key
npm run once          # refresh readings (also logs to Walrus)
npm run publish-feed  # one PTB: risk_feed::publish for every market
```

## 4. Anyone can read it
The market key is `SYMBOL<STRIKE@EXPIRYMS` (e.g. `BTC<56137@1780905600000`). Any Move contract:
```move
let p = risk_feed::probability_bps(&feed, market);   // implied prob of failure, bps
```
Or off-chain: read the `RiskFeed` shared object, or subscribe to `ReadingPublished` events.

## Notes
- `edition = "2024.beta"`; modern CLIs resolve the Sui framework implicitly. If an older CLI errors on the framework, uncomment the `[dependencies]` block in `Move.toml`.
- `tx.pure.string(...)` in `publishRiskFeed.ts` encodes the Move `std::string::String` args.
- The `RiskFeed` is shared (world-readable); only the `PublisherCap` holder can publish.
