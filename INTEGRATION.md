# Backstop Integration Kit

Backstop's live production surface is the Sui mainnet `pyth_cover_pool` v4
deployment for suiUSDe depeg cover. It is experimental and low-cap. The pool
requires a fresh Pyth sale check inside the buy transaction and refunds excess
premium instead of accepting donations into pool value.

Use the TypeScript SDK source from `sdk/` until a v4 npm release is explicitly
approved:

```bash
npm install @gudman/backstop-sdk @mysten/sui
```

## Production IDs

Canonical IDs live in `deployment.json` and `app/src/lib/deployment.ts`.

| Role                        | ID                                                                   |
| --------------------------- | -------------------------------------------------------------------- |
| `pyth_cover_pool` package   | `0x4f8d00eb76a59996a0c88f3d103e950e6e4c02132acb8483cc8e1450005f04e9` |
| Production pool             | `0xd739a318705fb8b8401da34a3c2c3cde6397d033d72f793153ea673216eb58ed` |
| `pyth_lending_demo` package | `0x25f89307f0e37079a8cd7be1aa10f216f1bf3d5b00c2184ea2b8bc9ffc51a670` |
| Production lending market   | `0x459b6df1dee2c3840a52b766d4c617fbabb1c5f9d08f557645080829fee9d74c` |
| Admin custody owner         | `0x5f21a9aaf680f6b0e0190e6a99bb9d4e314e0761ff3c3bc809f298711e73d8e5` |
| Cover UpgradeCap lock tx    | `7LJVLHs4Vb93pzS5WuwEgmwuZN9KEGBXbzx5b43kWLm9`                       |
| Lending UpgradeCap lock tx  | `GUm7a3fRpyQAQa92eBEEm3yVurGtfHz7vEifg7kaB4RL`                       |
| AdminCap custody tx         | `KJzWGum3aqUpH4BKxrX9DdZ5yCLp8yDvNUC28aMCZ39`                        |
| Production active-cover tx  | `Fk1hB7nsaYm5ZDww1sXwohHNYjcc3kmkd3qqUeFVdqwg`                       |
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
  buildDepegBuyCoverWithPythTx,
} from "@gudman/backstop-sdk";

const expiryMs = BigInt(Date.now() + 30 * 86_400_000 - 60_000);

const tx = await buildDepegBuyCoverWithPythTx({
  client,
  pkg: PYTH_DEPEG_COVER_PKG,
  poolId: PYTH_DEPEG_POOL,
  premiumMist,
  coverMist,
  expiryMs,
  owner: positionOwner,
});

await signAndExecute({ transaction: tx, chain: "sui:mainnet" });
```

## Record Breach

`record_breach` refreshes Pyth inside the PTB. On v4 it is a compatibility
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

The current production mainnet pool is v4 and supports `record_pool_breach` and
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
6. Buy a policy into the user's wallet, or into a protocol-owned position manager.
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

For protocols that do not want the SDK wrapper, the live v4 production calls are
`buy_cover`, `record_pool_breach`, `record_pool_recovery`, and
`claim_latched`. `record_breach` remains available for compatibility but should
not be your primary keeper path.

```ts
const [policy, refund] = tx.moveCall({
  target: `${PYTH_DEPEG_COVER_PKG}::pyth_cover_pool::buy_cover`,
  typeArguments: ["0x2::sui::SUI"],
  arguments: [
    tx.object(PYTH_DEPEG_POOL),
    premiumCoin,
    tx.pure.u64(coverMist),
    tx.pure.u64(expiryMs),
    tx.object(priceInfoObjectId),
    tx.object("0x6"),
  ],
});
tx.transferObjects([policy, refund], positionOwner);
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
`buildDepegBuyCoverWithPythTx` for the same reason.
