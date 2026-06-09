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

> Status: compiled + unit-tested. Live publish is the stretch (needs gas + the
> address override above); the agent publishes the readings this consumes via
> `agent/src/publishRiskFeed.ts`.
