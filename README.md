# Backstop

**The risk & trust layer for Sui — crash insurance priced by DeepBook Predict, proven on Walrus.**

> Insure your treasury against a crash in one click — priced live off an on-chain options oracle, underwritten by an autonomous agent, settled trustlessly in <400ms.

**Live:** https://backstop.gudman.xyz · Sui Overflow 2026 · DeepBook track (primary) · cross-listing Agentic Web + Walrus.

The **Risk terminal** and **AI underwriter** tabs are public (no wallet) — the underwriter rows link to the agent's real on-chain supplies.

---

## The thesis

In May 2025 a $223M exploit hit Sui's largest DEX. The backstop wasn't insurance — it was a **90.9% validator vote to roll back the chain**. That's governance-by-emergency, and it doesn't scale. Less than 2% of DeFi is insured, and nothing on Sui lets you _price_ or _transfer_ the risk that actually wipes people out: a crash or a depeg.

Backstop is that missing layer. **DeepBook Predict gives us the price of risk; Walrus gives us tamper-evident decision memory, and a public calibration ledger turns that memory into provable trust.** Insurance is the first product on top.

## What it does

A buyer mints a **DOWN binary** on a BTC oracle — it pays out if BTC settles below the strike at expiry (a crash payout). An underwriter `supply()`s capital to the vault to back those payouts and earn premium. Both sides settle trustlessly on DeepBook Predict.

Four pillars on that foundation:

1. **Portfolio crash protection** — read a wallet's holdings, compute drawdown exposure, one-click mint a basket of DOWN-binary policies ("insure my treasury against a 20% crash").
2. **Autonomous AI underwriter** — a Node agent reads Predict's on-chain volatility surface, turns each market's DOWN-binary price into an **implied probability of failure**, prices capacity + premium (Claude in the loop, deterministic-rules fallback), **supplies capital on-chain sized to its own decision**, and logs every decision + outcome to **Walrus** as tamper-evident decision memory.
3. **Live risk terminal** — implied-crash-probability curves across strikes (binary price = risk-neutral probability, a Sui-unique on-chain data product), straight from `devInspect` reads.
4. **On-chain RiskFeed** — a published probability-of-failure oracle (`RiskFeed` Move package) any Sui protocol can read to back its own solvency, each reading anchored to a Walrus blob.

## Live on testnet

Everything below is deployed and executed on Sui testnet. **Canonical full IDs live in [`deployment.json`](./deployment.json)** (object IDs abbreviated here).

| Artifact                                                                                              | ID / digest                                       |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Network                                                                                               | `testnet`                                         |
| RiskFeed package                                                                                      | `0xefda…cc6ef`                                    |
| RiskFeed shared object                                                                                | `0xa48b…1ddf4`                                    |
| Predict manager                                                                                       | `0x630f…123ac`                                    |
| **Live insurance mint** — DOWN BTC<$56,901, $10 cover, 0.2886 DUSDC premium                           | tx `G2X8UFPRjgYf76dA7FBziGg6cyUAkoepGnTuCakzCcBP` |
| **RiskFeed readings published** — 3 probabilities-of-failure, Walrus-linked                           | tx `Ad5Fcr6otec41vioS5mTPJGY89GaaKcQPdRUZc2bvbEz` |
| **Agent capacity-sized supply** — $100k capacity → $10.00 on-chain                                    | tx `EcRYQ3dLuATkef6Kv7P6Rj11B7bkriWHqXkRCLk8ogVa` |
| CoverPool package                                                                                     | `0x0ebd…6082f`                                    |
| **Parametric crash payout** — deposit → buy cover → crash → on-chain claim, settled from the pool     | tx `6zaXyBYjTduAYXUQGHjE6dAvLHX5t7muKRANTgpH6p2P` |
| Accountability package (passport + calibration)                                                       | `0x822e…d8d7e`                                    |
| **Bonded agent passport + calibration ledger** — predictions settled vs outcome, accuracy on-chain    | tx `GAdig2CpDouXXnEpW934F9HpjbWodm7g9GLj5whGqHoP` |
| **Backstop network** — `PoolRegistry` + `lending_demo` reserve backstopped by a pool claim on a crash | tx `9ASNW2B4FAthT5aw8x8gpcwwgq75mDm8TtjWoRNLMxqp` |

Explore any digest at `https://testnet.suivision.xyz/txblock/<digest>`; read any Walrus decision at `https://aggregator.walrus-testnet.walrus.space/v1/blobs/<blobId>`.

## Architecture

Monorepo, no shared build — each part runs independently.

```
app/         Vite + React frontend (dapp-kit). Tabs: Buy protection · Insure my
             treasury · My policies · Underwrite · Risk terminal · AI underwriter.
             Risk terminal + AI underwriter are public (read-only, no wallet).
agent/       Autonomous AI underwriter (Node + tsx). Reads oracles → prices risk →
             Claude/rules decision → supplies on-chain → logs to Walrus.
contracts/   risk_feed/ — on-chain RiskFeed: bonded multi-publisher probability-of-failure
             oracle with challenge/slash + freshness-enforced reads (probability_bps_fresh).
             pyth_cover_pool/ — mainnet depeg cover: SUI-collateralized, settled trustlessly
             against a Pyth price feed (the production settlement path).
             risk_guard/ — a consumer: treasury withdrawals freeze on crash risk.
             cover_pool/ — native parametric cover pool: LPs underwrite, claims pay from the pool.
             accountability/ — bonded AgentPassport + public CalibrationLedger (predictions vs outcomes).
             pool_registry/ — on-chain directory of cover pools by market.
             lending_demo/ — a protocol that backstops bad debt with a pool claim on a crash.
             pyth_lending_demo/ — the production analog: a SUI-reserve market that buys
             Pyth-settled depeg cover and claims the latched payout into its reserve.
spike/       Runnable verification harness for the Predict PTBs (the verified foundation).
```

**Stack:** Move (Sui) · DeepBook Predict (binary markets + SVI vol oracle) · Walrus (tamper-evident agent memory) · `@mysten/dapp-kit` 0.20 + `@mysten/sui` 1.x · React 18 + Vite · Node + tsx · Anthropic SDK (Claude underwriting).

## Run it

Node v24 + npm. No pnpm required.

### Frontend

```bash
cd app
npm install
npm run dev        # http://localhost:5173 — Risk terminal + AI underwriter work with no wallet
```

### AI underwriter agent

```bash
cd agent
npm install
npm run once       # one cycle: read oracles → price → decide → log to Walrus
                   # writes app/public/agent-decisions.json (the UI reads it)
```

Optional flags:

| Env var                               | Effect                                                                                                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`                   | Use Claude for the underwriting decision (else deterministic rules; decisions tagged `AI` vs `rules`).                                                  |
| `AGENT_EXECUTE=1` + `SUI_PRIVATE_KEY` | **Execute on-chain** — supply DUSDC into the Predict vault for each accepted market. Off by default (recommend-and-log only).                           |
| `AGENT_CAPACITY_BPS`                  | Fraction of the agent's recommended capacity to commit per call (default `1` = 1bp; raise toward `10000` = 100% with a funded production vault signer). |
| `AGENT_MAX_SUPPLY_USD`                | Per-call safety ceiling (default `25`).                                                                                                                 |

The signer needs testnet SUI (faucet) and gated DUSDC. With execution enabled, supply scales with the agent's risk assessment — proven live: $100k-capacity market → $10.00 supplied, $36,652-capacity → $3.6652, each settled on-chain.

## What's live vs. roadmap

**Live on testnet:** live quotes + risk terminal + AI underwriter + Walrus proof (read-only, no wallet); buy / underwrite / treasury _transactions_ (need gated DUSDC); the agent executing its own underwriting on-chain; the native parametric CoverPool (crash → on-chain payout). The on-chain `RiskFeed` is now a **bonded multi-publisher** oracle with challenge/slash and **freshness-enforced reads** (`probability_bps_fresh`) — no single key, and a payout can't settle on a stale reading.

**Live on mainnet — Pyth-settled depeg cover:** DeepBook Predict is testnet-only with no committed mainnet date, so the production settlement path moves to **Pyth** (live on Sui mainnet). [`contracts/pyth_cover_pool`](./contracts/pyth_cover_pool) is a SUI-collateralized parametric depeg-cover pool whose claim reads a Pyth feed on-chain (`get_price_no_older_than` — freshness by construction) and pays iff the insured stablecoin breaks its floor. The cover pool passes **34/34** Move tests, the lending consumer passes **4/4**, the **suiUSDe feed is confirmed live on Sui mainnet**, and `deployment.json` records the live package IDs, dependency-only upgrade-policy locks, and a staged buy → dwell → claim proof. The `app` "Depeg cover" tab and `@backstop/sdk` depeg helpers now point at the deployed mainnet pool by default.

**Roadmap (not shipped):** multi-asset markets, an underwriter marketplace, the generalized provenance standard, cross-chain agent reputation. Pricing stays subjective/off-chain; settlement is objective and on-chain — that split is why Backstop is a risk _layer_, not a single app.
