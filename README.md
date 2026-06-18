# Backstop

**The DeepBook-priced cover desk and risk clearinghouse for Sui DeFi.**

Backstop turns risk into a product surface protocols can use: quote cover,
create policies, monitor breach conditions, settle valid claims, and publish
proof receipts users can inspect.

Live: https://backstop.gudman.xyz

Primary track: **Sui Overflow 2026 / DeepBook specialized track**

## What this is

- `Mainnet depeg cover`: buy SUI-collateralized suiUSDe depeg protection from
  the deployed Pyth-settled pool.
- `Cover desk`: manage policies, create treasury cover, and supply liquidity as
  an underwriter.
- `Proof center`: inspect package, pool, policy lifecycle, and
  isolated testnet research artifacts.
- `Keeper operations`: public dry-run monitor for pool health, Pyth trigger
  state, policy actions, and wallet-gated execution boundaries.
- `Risk index`: SRX market table for depeg, SUI drawdown, stablecoin basket,
  lending collateral, and LP tail-risk lanes.
- `Buildout`: LP vaults, DeepBook hedge router modules, wallet risk warnings,
  institutional reports, and reputation signals.
- `Suilend pilot`: binds the first parsed Suilend obligation sample to an
  explicit-consent Backstop policy quote.
- `Protocol kit`: copy-paste SDK/PTB examples for NAVI/Suilend-style adapters,
  wallet quote widgets, and risk passports.
- `Agent underwriting ledger`: DeepBook/Walrus research lane for probability of
  failure and underwriting receipts.

## Live evidence

| Network | Artifact                           | Value                                                                 |
| ------- | ---------------------------------- | --------------------------------------------------------------------- |
| mainnet | Pyth depeg package                 | `0x761832702281966fac9dee6183b530d2f73ecd779524c61cd3dd4705fa6ec968`  |
| mainnet | Pyth depeg pool                    | `0x5edc508a4258e1253563219049dadc8b068cf309115e29732dad71698c168592`  |
| mainnet | Pyth price object                  | `0x9b2028bfc829127d2e5ead1691dc3002de9e9b8d8076b4915e5ecc7d9b99d63f`  |
| mainnet | Active policy example              | `0x3863ad1bf44904af1fcc3ead38589977378e6800e14ceacebf1205187ce695ec`  |
| mainnet | Latest judge-grade policy purchase | `0xcfd02fb3db64b76ca57f39bf2669a6cae6766713f593c0a52eaa5fa02aa79a46`  |
| mainnet | Latest policy tx digest            | `5AGzShNPABk9RMGmmFursqRgJiGLssLpdjW5b6z4kb74`                        |
| testnet | RiskFeed package                   | `0xefda410b91a3caec4cdb34f459a87909ad6b89c00f1ca392ce345c292f4cc6ef`  |
| testnet | RiskFeed shared object             | `0xa48b3769723ac4441fec2f9c87582b88f2cf8d0d551642e17aebae1609da1ddf4` |
| testnet | Staged claim replay                | `G2X8UFPRjgYf76dA7FBziGg6cyUAkoepGnTuCakzCcBP`                        |

Machine-readable artifacts:

- `https://backstop.gudman.xyz/api/proof.json`
- `https://backstop.gudman.xyz/api/risk-index.json`
- `https://backstop.gudman.xyz/api/submission.json`
- `https://backstop.gudman.xyz/api/buildout.json`
- `https://backstop.gudman.xyz/api/report.json`

Demo script:

- `DEMO_SCRIPT.md`

Judge flow:

1. Open `https://backstop.gudman.xyz/submission`.
2. Open `https://backstop.gudman.xyz/proof`.
3. Verify the mainnet package, pool, active policy, and proof health rows.
4. Open `https://suivision.xyz/txblock/5AGzShNPABk9RMGmmFursqRgJiGLssLpdjW5b6z4kb74` and confirm the policy created.
5. Open `https://backstop.gudman.xyz/depeg` and quote mainnet cover.
6. Open `https://backstop.gudman.xyz/protocol` and inspect the SDK/PTB adapter.
7. Open `https://backstop.gudman.xyz/risk-index` and inspect the expansion plan.
8. Open `https://backstop.gudman.xyz/suilend` and inspect the sample-validated
   Suilend obligation-to-policy flow.

## Protocol integration

Install the SDK:

```bash
npm install @gudman/backstop-sdk @mysten/sui
```

Quote mainnet depeg cover:

```ts
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { quoteDepegPremium, readDepegPool } from "@gudman/backstop-sdk";

const PYTH_DEPEG_POOL =
  "0x5edc508a4258e1253563219049dadc8b068cf309115e29732dad71698c168592";

const client = new SuiClient({ url: getFullnodeUrl("mainnet") });
const pool = await readDepegPool(client, PYTH_DEPEG_POOL);
const coverMist = 50_000_000n;
const premiumMist = quoteDepegPremium(pool, coverMist, 30);
```

Build a buy-cover PTB:

```ts
import { buildDepegBuyCoverTx } from "@gudman/backstop-sdk";

const tx = buildDepegBuyCoverTx({
  pkg: "0x761832702281966fac9dee6183b530d2f73ecd779524c61cd3dd4705fa6ec968",
  poolId: PYTH_DEPEG_POOL,
  premiumMist,
  coverMist,
  expiryMs: BigInt(Date.now() + 30 * 86_400_000 - 60_000),
  owner,
});
```

Important SDK boundary:

- The app passes current v3 mainnet package and pool IDs from
  `app/src/lib/proofData.ts`.
- The published npm package `@gudman/backstop-sdk@0.1.0` still has stale
  exported deployment constants. Use the builders and pass the IDs explicitly
  until a new SDK release is approved and published.

## Keeper operations

The `/proof` page includes a public dry-run keeper monitor:

- Pool solvency watch is public now.
- Breach observation is wallet-gated.
- Dwell confirmation and claim are wallet-gated.
- Expiry sweep is wallet-gated.
- Suilend exposure sync is sample-validated and consent-gated; NAVI exposure
  sync is still partner-gated.
- DeepBook hedge routing is post-hackathon until a funded budget exists.

The public monitor does not sign transactions and does not claim keeper-run logs
unless an exact transaction digest exists.

## Why DeepBook matters

Backstop is not a generic insurance UI. DeepBook is the market layer that makes
the risk legible:

- DeepBook Predict surfaces calibrate crash/depeg probability.
- DeepBook liquidity depth informs capacity and hedge limits.
- Risk markets become tradable, underwritable, and auditable instead of hidden
  governance promises.
- Backstop can route future hedge budgets into DeepBook-priced instruments.

## Run locally

```bash
cd app
npm install
npm run dev
```

Agent underwriting ledger:

```bash
cd agent
npm install
npm run once
```

Operational scripts:

```bash
cd app
npm run keeper:depeg
npm run adapter:probe
npm run adapter:suilend
npm run report:generate
```

`keeper:depeg` is dry-run by default. Execution requires
`BACKSTOP_DEPEG_KEEPER_EXECUTE=1` plus `SUI_PRIVATE_KEY`.

For the public proof UI, use:

```bash
cd app
npm run keeper:depeg:publish
```

This writes `app/public/api/keeper-operations.json` with the latest lane snapshot
and populates the "Keeper receipts" section under `/proof`.

`adapter:suilend` parses the first live Suilend sample obligation from
transaction `2PBCaEbBHiFLU7fDwU4zihUq4CQtKArbXXC9JygTL169` into normalized
Backstop exposure rows.

## Current boundaries

- Mainnet depeg cover is live and unaudited; use small amounts until external
  review and liquidity policy are complete.
- The DeepBook Predict / RiskFeed / Walrus agent lane is a testnet research
  lane and is isolated from the mainnet cover pool.
- The legacy testnet cover-pool lane is not the production product.
- Suilend has a live sample parser and consented pilot route; production
  auto-cover still needs partner-approved parser versioning and governance caps.
- NAVI remains an adapter spec until one borrower or vault object sample is
  confirmed.
