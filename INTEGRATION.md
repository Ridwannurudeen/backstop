# Backstop Integration Kit

Backstop's live production surface is the Sui mainnet `pyth_cover_pool` v6
deployment for suiUSDe depeg cover. It is experimental and low-cap. The pool
requires a fresh Pyth sale check inside the buy transaction, refunds excess
premium instead of accepting donations into pool value, and disables direct
wallet sales by default. Protocol adapters buy cover through a pool-scoped
`BuyerCap`. A separate open direct-sale pool powers SafePay, where a SUI payment
and recipient-owned cover policy are delivered in one PTB.

Use the published SDK for stable v6 helpers, or the app source for the
experimental SafePay helper until the next SDK release:

```bash
npm install @gudman/backstop-sdk @mysten/sui
```

## Production IDs

Canonical IDs live in `deployment.json` and `app/src/lib/deployment.ts`.

| Role                        | ID                                                                   |
| --------------------------- | -------------------------------------------------------------------- |
| `pyth_cover_pool` package   | `0x3ec312b1173922dfe6d5866741299f4525c135fa90709a39ddb0a0f7e8baccb5` |
| Production pool             | `0x1d9d15da40239822d4201e713ae92d5fec415f9771e4711be30fc7e76886c523` |
| Open SafePay package        | `0x695059637b8706b6d095b794fcb38565f0a3b8e5384d3e812bda0c36f56cad62` |
| Open SafePay pool           | `0x457123082ccd9677be44c74f81e2d24ecc43ef50de1378695b9ede1e9561b3e2` |
| `pyth_lending_demo` package | `0x729e11856afe3d1f7678366b7fbcbe8af0aecb623cc0277f372a5b95fa6a3b2e` |
| Production lending market   | `0xf36d1a0f00e1777e0c4ce3b4355d531f15d06b4d0aa6a87160fe4a18e575b209` |
| Admin custody owner         | `0x5f21a9aaf680f6b0e0190e6a99bb9d4e314e0761ff3c3bc809f298711e73d8e5` |
| Cover UpgradeCap lock tx    | `Bp9wqauHkuAKSWUkj7kT3r14bg3jULbdp27VfixZ5S7V`                       |
| Lending UpgradeCap lock tx  | `Bp9wqauHkuAKSWUkj7kT3r14bg3jULbdp27VfixZ5S7V`                       |
| AdminCap custody tx         | `FA6QsTgABa8mCvcmZWpAnUFBJRKoG9zuXuFkhUqjFsrZ`                       |
| Production active-cover tx  | `98LSeMGDYvmKsYqv7wmRTnrWvLcuAdhGHctbthCgJ8E3`                       |
| Archived staged claim tx    | `Dm9gywopkRe9p36J21HTiLJCeRaRhdjwYaDx13WA2ekC`                       |

## SafePay PTB Shape

SafePay is the programmable-payment path: a payer sends SUI and attaches
recipient-owned depeg cover in the same Sui transaction. The app implementation
lives in `app/src/lib/depegPool.ts` as `buildSafePayWithCoverTx`.

```ts
const tx = await buildSafePayWithCoverTx({
  client,
  pkg: openCoverPackage,
  poolId: openPool,
  paymentMist,
  premiumMist,
  coverMist,
  expiryMs,
  payer,
  recipient,
});

await signAndExecute({ transaction: tx, chain: "sui:mainnet" });
```

The PTB splits payment and premium from SUI, refreshes Pyth, calls
`buy_cover`, transfers `[payment, policy]` to the recipient, and returns the
premium refund coin to the payer. If the Pyth sale guard, confidence bound,
pool cap, pause state, or epoch state rejects the cover leg, the payment leg
does not settle.

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
