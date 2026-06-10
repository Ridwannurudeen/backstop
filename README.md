# Backstop

**The risk & trust layer for Sui — crash insurance priced by DeepBook Predict, proven on Walrus.**

> Insure your treasury against a crash in one click — priced live off an on-chain options oracle, underwritten by an autonomous agent, settled trustlessly in <400ms.

**Live:** https://backstop.gudman.xyz · Sui Overflow 2026 · DeepBook track (primary) · cross-listing Agentic Web + Walrus.

The **Risk terminal** and **AI underwriter** tabs are public (no wallet) — the underwriter rows link to the agent's real on-chain supplies.

---

## The thesis

In May 2025 a $223M exploit hit Sui's largest DEX. The backstop wasn't insurance — it was a **90.9% validator vote to roll back the chain**. That's governance-by-emergency, and it doesn't scale. Less than 2% of DeFi is insured, and nothing on Sui lets you *price* or *transfer* the risk that actually wipes people out: a crash or a depeg.

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

| Artifact | ID / digest |
|---|---|
| Network | `testnet` |
| RiskFeed package | `0xefda…cc6ef` |
| RiskFeed shared object | `0xa48b…1ddf4` |
| Predict manager | `0x630f…123ac` |
| **Live insurance mint** — DOWN BTC<$56,901, $10 cover, 0.2886 DUSDC premium | tx `G2X8UFPRjgYf76dA7FBziGg6cyUAkoepGnTuCakzCcBP` |
| **RiskFeed readings published** — 3 probabilities-of-failure, Walrus-linked | tx `Ad5Fcr6otec41vioS5mTPJGY89GaaKcQPdRUZc2bvbEz` |
| **Agent capacity-sized supply** — $100k capacity → $10.00 on-chain | tx `EcRYQ3dLuATkef6Kv7P6Rj11B7bkriWHqXkRCLk8ogVa` |
| CoverPool package | `0x0ebd…6082f` |
| **Parametric crash payout** — deposit → buy cover → crash → on-chain claim, settled from the pool | tx `6zaXyBYjTduAYXUQGHjE6dAvLHX5t7muKRANTgpH6p2P` |

Explore any digest at `https://testnet.suivision.xyz/txblock/<digest>`; read any Walrus decision at `https://aggregator.walrus-testnet.walrus.space/v1/blobs/<blobId>`.

## Architecture

Monorepo, no shared build — each part runs independently.

```
app/         Vite + React frontend (dapp-kit). Tabs: Buy protection · Insure my
             treasury · My policies · Underwrite · Risk terminal · AI underwriter.
             Risk terminal + AI underwriter are public (read-only, no wallet).
agent/       Autonomous AI underwriter (Node + tsx). Reads oracles → prices risk →
             Claude/rules decision → supplies on-chain → logs to Walrus.
contracts/   risk_feed/ — on-chain RiskFeed (probability-of-failure oracle).
             risk_guard/ — a consumer: treasury withdrawals freeze on crash risk.
             cover_pool/ — native parametric cover pool: LPs underwrite, claims pay from the pool.
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

| Env var | Effect |
|---|---|
| `ANTHROPIC_API_KEY` | Use Claude for the underwriting decision (else deterministic rules; decisions tagged `AI` vs `rules`). |
| `AGENT_EXECUTE=1` + `SUI_PRIVATE_KEY` | **Execute on-chain** — supply DUSDC into the Predict vault for each accepted market. Off by default (recommend-and-log only). |
| `AGENT_CAPACITY_BPS` | Fraction of the agent's recommended capacity to commit per call (default `1` = 1bp; raise toward `10000` = 100% with a funded production vault signer). |
| `AGENT_MAX_SUPPLY_USD` | Per-call safety ceiling (default `25`). |

The signer needs testnet SUI (faucet) and gated DUSDC. With execution enabled, supply scales with the agent's risk assessment — proven live: $100k-capacity market → $10.00 supplied, $36,652-capacity → $3.6652, each settled on-chain.

## What's live vs. roadmap

**Live now:** live quotes + risk terminal + AI underwriter + Walrus proof (all read-only, no wallet); buy / underwrite / treasury *transactions* (need gated DUSDC); the `RiskFeed` on-chain oracle; the agent executing its own underwriting on-chain.

**Roadmap (next, not shipped):** mutualized capital pool / protocol cover, multi-asset + stablecoin-depeg markets (the RWA wave), agent bonding, mainnet deploy once DeepBook Predict ships to mainnet. The depeg framing is why this is a risk *layer*, not a single app.
