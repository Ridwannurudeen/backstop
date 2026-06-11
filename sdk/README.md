# @backstop/sdk

Read Sui's on-chain **risk layer** in a few lines. Backstop publishes risk as a public
good on Sui testnet (over DeepBook Predict): the **SRX** fear index, a **RiskFeed**
probability-of-failure oracle, and **parametric cover pools** whose claims settle on
DeepBook's own oracle.

```bash
npm install @backstop/sdk @mysten/sui
```

## Read the fear index

```ts
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { readSrx } from "@backstop/sdk";

const client = new SuiClient({ url: getFullnodeUrl("testnet") });
const srx = await readSrx(client);
// { crashBps: 747, volBps: 4130, tailBps: 2031, refPriceUsd: 62744, cdfBlobUrl, challenged }
console.log(`BTC 30d crash probability: ${srx.crashBps / 100}%`);
```

`cdfBlobUrl` is the Walrus-anchored input CDF — anyone can reproduce the index from it.

## Read a market's probability of failure

```ts
import { readCrashProbabilityBps } from "@backstop/sdk";
const bps = await readCrashProbabilityBps(client, "BTC<56901@1780992000000");
```

## Buy parametric cover

```ts
import { buildBuyCoverTx } from "@backstop/sdk";
const tx = buildBuyCoverTx({
  poolId, premiumMist: 4_400_000n, coverMist: 50_000_000n,
  expiryMs: BigInt(Date.now() + 30 * 86_400_000), owner: address,
});
await client.signAndExecuteTransaction({ signer, transaction: tx });
```

## Consume the risk layer from your own Move contract

Any Sui contract can read the RiskFeed and gate its own logic — the pattern Backstop's
own `risk_guard` and `lending_demo` consumers use:

```move
use risk_feed::risk_feed::{Self, RiskFeed};

public fun is_safe(feed: &RiskFeed, market: String, tolerance_bps: u64): bool {
    risk_feed::has_market(feed, market)
        && risk_feed::probability_bps(feed, market) <= tolerance_bps
}
```

Point your package's `risk_feed` dependency at the live package id (in
`deployment.json`) and your bytecode links to the deployed feed on-chain.

## Live ids

All package + object ids are exported from `@backstop/sdk` (and canonical in the repo's
`deployment.json`). Testnet only today; DeepBook Predict mainnet is later 2026.
