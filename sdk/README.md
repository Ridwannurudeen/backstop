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
  builders, Pyth-refreshing keeper builders, direct-sale compatibility builders,
  and BuyerCap purchase builders for adapter-held policies
- pool-epoch builders (`record_pool_breach` / `record_pool_recovery`) for
  batch claimability

Version `0.1.2` points at the v5 low-cap mainnet pool recorded in
`deployment.json`. Direct wallet buys are disabled on that pool; protocol
adapters buy position-bound cover with the pool-scoped `BuyerCap`. The
RiskFeed/SRX/Predict surface is testnet-only today.

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

Buy cover for a protocol adapter:

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
  expiryMs: BigInt(Date.now() + 30 * 86_400_000 - 60_000),
  owner: adapterOrPositionManager,
});
```

Direct-sale builders remain available only for legacy or intentionally
direct-sales-enabled pools:

```ts
import { buildDepegBuyCoverWithPythTx } from "@gudman/backstop-sdk";

const tx = await buildDepegBuyCoverWithPythTx({
  client,
  pkg: LEGACY_DEPEG_COVER_PKG,
  poolId: LEGACY_DEPEG_POOL,
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

Prefer the pool-level epoch builders for keeper operations. For the v5 adapter
market, use the reference `pyth_lending_demo::record_shortfall` flow from the
repository integration scripts.

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

See `../INTEGRATION.md` for NAVI/Suilend integration shape and BuyerCap PTB
examples.

## Important language

- The Pyth depeg pool has objective on-chain settlement rules.
- The testnet RiskFeed/accountability lanes are not fully trustless today;
  dispute resolution is admin-resolved.
- The legacy `cover_pool` lane is not production-safe and should not be marketed
  as the product.
