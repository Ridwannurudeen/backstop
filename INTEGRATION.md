# Backstop Integration Kit

Backstop's production surface is the Sui mainnet `pyth_cover_pool` v3 deployment
for suiUSDe depeg cover. It is fully collateralized in SUI, priced by pool terms,
and settled by Pyth with freshness, confidence-band, activation-delay, and dwell
checks. v3 also adds pool-level depeg epochs for batch claimability during a mass
depeg.

Install the TypeScript SDK:

```bash
npm install @gudman/backstop-sdk @mysten/sui
```

## Production IDs

Canonical IDs live in `deployment.json` and `app/src/lib/deployment.ts`.

| Role                        | ID                                                                   |
| --------------------------- | -------------------------------------------------------------------- |
| `pyth_cover_pool` package   | `0x51dd7287ac9e97147982023f5f2fa61bf5df2939d671216b19d142938f34ab05` |
| Production pool             | `0x4ab0a68e6c299353811a54b660c7e1d8cda7645a5f58c77b8593ca4bc617dc53` |
| `pyth_lending_demo` package | `0x33cd7e03003948545527609769b77541a9c0f3f8005894d8736fdf293cbf531a` |
| Production lending market   | `0x27d3f2753ab05170d0484a70114191f4fcdb35275db9b2ad9895db18cc92e712` |
| Admin custody owner         | `0x5f21a9aaf680f6b0e0190e6a99bb9d4e314e0761ff3c3bc809f298711e73d8e5` |
| Upgrade policy lock tx      | `7Yxfqa2fStqnfvYJ8qD97m5ZBznYcpUsTQncCZ8tavKy`                       |
| AdminCap custody tx         | `2PGfhTmFzDTJZxuGGKxfkhAgRNmcLjbkt3MXJdYfBhYx`                       |
| Production active-cover tx  | `HLteoSCKnBzRUhLjfboRFh267FF8wF7MrsUAiXHmYerU`                       |
| Staged claim tx             | `Dm9gywopkRe9p36J21HTiLJCeRaRhdjwYaDx13WA2ekC`                       |

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

const coverMist = 50_000_000n;
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
  buildDepegBuyCoverTx,
} from "@gudman/backstop-sdk";

const expiryMs = BigInt(Date.now() + 30 * 86_400_000 - 60_000);

const tx = buildDepegBuyCoverTx({
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

`record_breach` refreshes Pyth inside the PTB and advances the policy's dwell
latch if the adverse price band is below the floor. A claim is not single-read:
keepers call once to arm, then again after `min_dwell_secs` to confirm.

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

The current production mainnet pool is v3 and supports `record_pool_breach` and
`record_pool_recovery`: one sustained pool epoch can make every policy that was
active at arm time and unexpired at confirmation claimable. Per-policy
`record_breach` remains available for direct holder/position-manager flows.

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
7. Run a keeper that records breach observations during a sustained depeg. Prefer
   pool-level epochs for mass-depeg handling; use per-policy `record_breach` for
   direct position-manager settlement.
8. Claim latched policies into the intended reserve or user payout recipient.

Backstop's app already implements fixture-backed NAVI and Suilend parsers in
`app/src/lib/depegPosition.ts`, and the no-funds verifier runs:

```bash
npm run verify:depeg
npm run verify:depeg-ptbs
```

## Direct PTB Shape

For protocols that do not want the SDK wrapper, the production calls are
`buy_cover`, `record_breach`, `record_pool_breach`, `record_pool_recovery`, and
`claim_latched`.

```ts
tx.moveCall({
  target: `${PYTH_DEPEG_COVER_PKG}::pyth_cover_pool::buy_cover`,
  typeArguments: ["0x2::sui::SUI"],
  arguments: [
    tx.object(PYTH_DEPEG_POOL),
    premiumCoin,
    tx.pure.u64(coverMist),
    tx.pure.u64(expiryMs),
    tx.object("0x6"),
  ],
});
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

`record_breach` should normally be built through the SDK because the SDK fetches
Hermes update data and inserts the Pyth update call before the Move call.
