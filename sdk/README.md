# Backstop SDK

TypeScript helpers for Backstop's on-chain surfaces.

## Install

```bash
npm install @gudman/backstop-sdk @mysten/sui
```

## Build

```bash
npm install
npm run build
```

## What it exposes

- SRX / RiskFeed testnet readers
- legacy testnet cover-pool builders, kept for lab/proof work only
- mainnet Pyth depeg readers, duration-aware premium quotes, expiry-release
  builders, Pyth-refreshing keeper builders, and an explicit v4 purchase builder
- pool-epoch builders (`record_pool_breach` / `record_pool_recovery`) for
  batch claimability

Version `0.1.1` points at the v3 production pool recorded in `deployment.json`.
The current repository source contains v4 hardening that is not live until a new
package/pool is deployed. The RiskFeed/SRX/Predict surface is testnet-only
today.

## Mainnet Depeg Examples

Quote cover:

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
```

Buy cover:

```ts
import {
  PYTH_DEPEG_COVER_PKG,
  PYTH_DEPEG_POOL,
  buildDepegBuyCoverTx,
} from "@gudman/backstop-sdk";

const tx = buildDepegBuyCoverTx({
  pkg: PYTH_DEPEG_COVER_PKG,
  poolId: PYTH_DEPEG_POOL,
  premiumMist,
  coverMist,
  expiryMs: BigInt(Date.now() + 30 * 86_400_000 - 60_000),
  owner,
});
```

The corrected v4 source adds a same-PTB Pyth sale check. Use the explicit v4
builder only with a v4 package/pool:

```ts
import { buildDepegBuyCoverWithPythTx } from "@gudman/backstop-sdk";

const tx = await buildDepegBuyCoverWithPythTx({
  client,
  pkg: V4_DEPEG_COVER_PKG,
  poolId: V4_DEPEG_POOL,
  premiumMist,
  coverMist,
  expiryMs: BigInt(Date.now() + 30 * 86_400_000 - 60_000),
  owner,
});
```

Record breach compatibility path:

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
```

Prefer the pool-level epoch builders for keeper operations.

Record a pool-level epoch:

```ts
import {
  PYTH_DEPEG_COVER_PKG,
  PYTH_DEPEG_POOL,
  buildDepegRecordPoolBreachTx,
  buildDepegRecordPoolRecoveryTx,
} from "@gudman/backstop-sdk";

const armOrConfirm = await buildDepegRecordPoolBreachTx({
  client,
  pkg: PYTH_DEPEG_COVER_PKG,
  poolId: PYTH_DEPEG_POOL,
});

const recover = await buildDepegRecordPoolRecoveryTx({
  client,
  pkg: PYTH_DEPEG_COVER_PKG,
  poolId: PYTH_DEPEG_POOL,
});
```

Claim latched cover:

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
  owner,
});
```

See `../INTEGRATION.md` for NAVI/Suilend integration shape and direct PTB
examples.

## Important language

- The Pyth depeg pool has objective on-chain settlement rules.
- The testnet RiskFeed/accountability lanes are not fully trustless today;
  dispute resolution is admin-resolved.
- The legacy `cover_pool` lane is not production-safe and should not be marketed
  as the product.
