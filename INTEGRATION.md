# Backstop Integration Kit

Backstop's live production surface is the Sui mainnet `pyth_cover_pool` v6
deployment for suiUSDe depeg cover. It is experimental and low-cap. The pool
requires a fresh Pyth sale check inside the buy transaction, refunds excess
premium instead of accepting donations into pool value, and disables direct
wallet sales by default. Protocol adapters buy cover through a pool-scoped
`BuyerCap`.

Use the TypeScript SDK source from `sdk/` until a v6 npm release is explicitly
approved:

```bash
npm install @gudman/backstop-sdk @mysten/sui
```

## Production IDs

Canonical IDs live in `deployment.json` and `app/src/lib/deployment.ts`.

| Role                        | ID                                                                   |
| --------------------------- | -------------------------------------------------------------------- |
| `pyth_cover_pool` package   | `0x49a4385606094ec78faa8b445372e8dd515dd0ddb513730a8ba9c4b734d5827c` |
| Production pool             | `0x55fe8bb8730c68931bbbcf876b7007d190febb04e2b82cccac7057868e83d8b1` |
| `pyth_lending_demo` package | `0xdbddf4df28aea4489f7979cc608bea4a599a6643f79bfe10cecca1cc06aabaa8` |
| Production lending market   | `0xda46848a368d5ea6c48f776fc233479c30ac807a1b1a2d5c0b59de11b3bac0c0` |
| Admin custody owner         | `0x5f21a9aaf680f6b0e0190e6a99bb9d4e314e0761ff3c3bc809f298711e73d8e5` |
| Cover UpgradeCap lock tx    | `FhJxJrZFoQmePPcnMiJ2C5TXKFzSaub27GRh934PyK23`                       |
| Lending UpgradeCap lock tx  | `FhJxJrZFoQmePPcnMiJ2C5TXKFzSaub27GRh934PyK23`                       |
| AdminCap custody tx         | `FA6QsTgABa8mCvcmZWpAnUFBJRKoG9zuXuFkhUqjFsrZ`                       |
| Production active-cover tx  | `GfEGXtLsJvdRCHakV7dNpq3BHvKuxBJV68tenEtcsNDR`                       |
| Archived staged claim tx    | `Dm9gywopkRe9p36J21HTiLJCeRaRhdjwYaDx13WA2ekC`                       |

## Quote Cover

```ts
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import {
  PYTH_DEPEG_POOL,
  quoteDepegPremium,
  readDepegPool,
} from "@gudman/backstop-sdk";

const client = new SuiClient({ url: getFullnodeUrl("mainnet") });
const pool = await readDepegPool(client, PYTH_DEPEG_POOL);

const coverMist = 5_000_000n;
const premiumMist = quoteDepegPremium(pool, coverMist, 30);

console.log({
  coverMist: coverMist.toString(),
  premiumMist: premiumMist.toString(),
});
```

## Buy Cover For A Position

Use this after your app has sized a position's stablecoin exposure into a SUI
payout amount. Keep expiry slightly below the pool max term to avoid local-clock
versus chain-clock edge cases.

```ts
import {
  PYTH_DEPEG_COVER_PKG,
  PYTH_DEPEG_POOL,
  buildDepegBuyCoverWithCapAndPythTx,
} from "@gudman/backstop-sdk";

const expiryMs = BigInt(Date.now() + 30 * 86_400_000 - 60_000);

const tx = await buildDepegBuyCoverWithCapAndPythTx({
  client,
  pkg: PYTH_DEPEG_COVER_PKG,
  poolId: PYTH_DEPEG_POOL,
  buyerCapId,
  premiumMist,
  coverMist,
  expiryMs,
  owner: adapterOrPositionManager,
});

await signAndExecute({ transaction: tx, chain: "sui:mainnet" });
```

## Restricted Adapter Buy

Direct wallet sales are disabled on the production v6 pool. The pool creator
installs the pool `BuyerCap` into a protocol adapter, then the adapter buys and
holds the policy for a specific position or reserve.

```ts
import {
  PYTH_DEPEG_COVER_PKG,
  PYTH_DEPEG_POOL,
  buildDepegBuyCoverWithCapAndPythTx,
} from "@gudman/backstop-sdk";

const tx = await buildDepegBuyCoverWithCapAndPythTx({
  client,
  pkg: PYTH_DEPEG_COVER_PKG,
  poolId: PYTH_DEPEG_POOL,
  buyerCapId,
  premiumMist,
  coverMist,
  expiryMs,
  owner: adapterOrPositionManager,
});

await signAndExecute({ transaction: tx, chain: "sui:mainnet" });
```

For a stable-collateral pool, pass the collateral type argument and the premium
coin object instead of splitting SUI gas:

```ts
const tx = await buildDepegBuyCoverWithCapAndPythTx({
  client,
  pkg,
  poolId,
  buyerCapId,
  coinType: usdcCoinType,
  premiumCoinId: usdcCoinObjectId,
  premiumMist,
  coverMist,
  expiryMs,
  owner: adapterOrPositionManager,
});
```

## Record Breach

`record_breach` refreshes Pyth inside the PTB. On v6 it is a compatibility
path around pool-epoch eligibility, not a separate per-policy event machine. A
claim is not single-read: keepers call once to arm, then again after
`min_dwell_secs` to confirm.

```ts
import {
  PYTH_DEPEG_COVER_PKG,
  PYTH_DEPEG_POOL,
  buildDepegRecordBreachTx,
} from "@gudman/backstop-sdk";

const tx = await buildDepegRecordBreachTx({
  client,
  pkg: PYTH_DEPEG_COVER_PKG,
  poolId: PYTH_DEPEG_POOL,
  policyId,
});

await signAndExecute({ transaction: tx, chain: "sui:mainnet" });
```

## Record Pool-Level Epoch

The current production mainnet pool is v6 and supports `record_pool_breach` and
`record_pool_recovery`: one sustained pool epoch can make every policy that was
active at arm time and unexpired at confirmation claimable. Prefer this path for
all keeper operations.

```ts
import {
  PYTH_DEPEG_COVER_PKG,
  PYTH_DEPEG_POOL,
  buildDepegRecordPoolBreachTx,
  buildDepegRecordPoolRecoveryTx,
} from "@gudman/backstop-sdk";

const breachTx = await buildDepegRecordPoolBreachTx({
  client,
  pkg: PYTH_DEPEG_COVER_PKG,
  poolId: PYTH_DEPEG_POOL,
});

const recoveryTx = await buildDepegRecordPoolRecoveryTx({
  client,
  pkg: PYTH_DEPEG_COVER_PKG,
  poolId: PYTH_DEPEG_POOL,
});
```

## Claim Latched Cover

Once a policy is latched, the claim does not need another Pyth read.

```ts
import {
  PYTH_DEPEG_COVER_PKG,
  PYTH_DEPEG_POOL,
  buildDepegClaimLatchedTx,
} from "@gudman/backstop-sdk";

const tx = buildDepegClaimLatchedTx({
  pkg: PYTH_DEPEG_COVER_PKG,
  poolId: PYTH_DEPEG_POOL,
  policyId,
  owner: payoutRecipient,
});

await signAndExecute({ transaction: tx, chain: "sui:mainnet" });
```

## NAVI / Suilend Integration Pattern

1. Read a wallet's lending position objects or owner caps.
2. Parse USDe-family supply and borrow lines.
3. Compute net stable exposure in USD.
4. Convert that exposure into a SUI payout amount using Pyth SUI/USD.
5. Quote the Backstop pool.
6. Install the `BuyerCap` into the adapter and buy through `buy_cover_with_cap`.
7. Run a keeper that records breach observations during a sustained depeg through
   pool-level epochs.
8. Claim latched policies into the intended reserve or user payout recipient.

Backstop's app already implements fixture-backed NAVI and Suilend parsers in
`app/src/lib/depegPosition.ts`, and the no-funds verifier runs:

```bash
npm run verify:depeg
npm run verify:depeg-ptbs
```

## Direct PTB Shape

For protocols that do not want the SDK wrapper, the live v6 production calls are
`buy_cover_with_cap`, `record_pool_breach`, `record_pool_recovery`, and
`claim_latched`. Direct `buy_cover` is disabled on the production v6 pool.
`record_breach` remains available for compatibility but should not be your
primary keeper path.

```ts
const [policy, refund] = tx.moveCall({
  target: `${PYTH_DEPEG_COVER_PKG}::pyth_cover_pool::buy_cover_with_cap`,
  typeArguments: [collateralCoinType],
  arguments: [
    tx.object(poolId),
    tx.object(buyerCapId),
    premiumCoin,
    tx.pure.u64(coverMist),
    tx.pure.u64(expiryMs),
    tx.object(priceInfoObjectId),
    tx.object("0x6"),
  ],
});
tx.transferObjects([policy, refund], adapterOrPositionManager);
```

```ts
tx.moveCall({
  target: `${PYTH_DEPEG_COVER_PKG}::pyth_cover_pool::record_breach`,
  typeArguments: ["0x2::sui::SUI"],
  arguments: [
    tx.object(PYTH_DEPEG_POOL),
    tx.object(policyId),
    tx.object(priceInfoObjectId),
    tx.object("0x6"),
  ],
});
```

```ts
tx.moveCall({
  target: `${PYTH_DEPEG_COVER_PKG}::pyth_cover_pool::record_pool_breach`,
  typeArguments: ["0x2::sui::SUI"],
  arguments: [
    tx.object(PYTH_DEPEG_POOL),
    tx.object(priceInfoObjectId),
    tx.object("0x6"),
  ],
});
```

```ts
tx.moveCall({
  target: `${PYTH_DEPEG_COVER_PKG}::pyth_cover_pool::record_pool_recovery`,
  typeArguments: ["0x2::sui::SUI"],
  arguments: [
    tx.object(PYTH_DEPEG_POOL),
    tx.object(priceInfoObjectId),
    tx.object("0x6"),
  ],
});
```

```ts
tx.moveCall({
  target: `${PYTH_DEPEG_COVER_PKG}::pyth_cover_pool::claim_latched`,
  typeArguments: ["0x2::sui::SUI"],
  arguments: [tx.object(PYTH_DEPEG_POOL), tx.object(policyId)],
});
```

`record_pool_breach`, `record_pool_recovery`, and `record_breach` should
normally be built through the SDK because the SDK fetches Hermes update data and
inserts the Pyth update call before the Move call. Purchases should use
`buildDepegBuyCoverWithCapAndPythTx` for the same reason.
