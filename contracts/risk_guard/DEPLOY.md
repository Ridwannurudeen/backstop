# risk_guard — deploy & demo

`risk_guard` is a worked example of a Sui protocol **consuming** the Backstop
`RiskFeed`: a `GuardedTreasury<T>` whose withdrawals freeze automatically when the
market-implied crash probability for a market exceeds the treasury's tolerance —
a market-priced circuit breaker instead of a validator rollback vote.

## Build & test (no chain, no gas)

```bash
cd contracts/risk_guard
../../.tools/sui.exe move test
```

Expected: `Total tests: 2; passed: 2` — withdrawals allowed when the feed reads
2% crash probability, frozen when it reads 12% (tolerance 5%).

## Publish against the LIVE RiskFeed (needs gas)

The local build compiles `risk_feed` from `../risk_feed` with its named address at
`0x0`. To publish `risk_guard` so it calls the **already-deployed** feed, override
the `risk_feed` address with its live package id (in `deployment.json` →
`riskFeedPackage`):

```bash
cd contracts/risk_guard
../../.tools/sui.exe client publish \
  --with-unpublished-dependencies=false \
  ./ \
  # set [addresses] risk_feed = "<riskFeedPackage from deployment.json>" first,
  # or pass it via the published-at field in ../risk_feed/Move.toml.
```

Then create a guarded treasury bound to the live BTC market and the on-chain feed:

```bash
# create_and_share<COINTYPE>(market_bytes, max_prob_bps)
../../.tools/sui.exe client call \
  --package <risk_guard pkg> --module risk_guard --function create_and_share \
  --type-args <COINTYPE> \
  --args 0x425443 500   # b"BTC", 5.00% tolerance
```

A withdrawal then reads the live feed: it succeeds while the published BTC crash
probability stays under 5%, and aborts (`ECrashRiskTooHigh`) when a reading breaches
it — provably driven by the same on-chain RiskFeed the underwriter publishes to.

## Live end-to-end demo (one command)

`agent/src/demoGuard.ts` creates a `GuardedTreasury<SUI>`, deposits, and withdraws —
the withdraw reads the live `RiskFeed` and only releases funds if the market is calm:

```bash
cd agent
RISK_GUARD_PKG=<riskGuard.package> RISK_FEED_OBJ=<riskFeed.feedObject> \
GUARD_MARKET="BTC<56901@1780992000000" GUARD_TOL_BPS=500 \
SUI_PRIVATE_KEY=<funded key> npx tsx src/demoGuard.ts
```

> Status: **LIVE on testnet.** `risk_guard` package `0xe748…6d8e` (publish
> `6dtyv7uPFJHo76xkvJkqYpMRxJdGSQB7LuthBKQgoqsy`) links against the deployed
> `risk_feed`. A `GuardedTreasury<SUI>` (`0x784e…ddb6`) was created
> (`AFMA9saypdJ1sc9UbCcgsrh27MxYxR23jKAwL5ofBYH6`) and a withdrawal **succeeded by
> reading the live feed** — BTC crash prob 282 bps ≤ 500 bps tolerance — tx
> `7eGTCiTQMsqzZNW519GRRHiv5AUWWu4uyBsuwcsjc8We`. Full ids in `deployment.json`.
