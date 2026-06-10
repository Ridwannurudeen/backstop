# Backstop — Sui Overflow 2026 Submission

## Project

- **Name:** Backstop
- **One-liner:** The risk & trust layer for Sui — crash insurance priced by DeepBook Predict, proven on Walrus.
- **Tracks:** DeepBook (primary) · cross-listing Agentic Web + Walrus.
- **Live:** https://backstop.gudman.xyz (Risk terminal + AI underwriter are public — no wallet needed).
- **Repo:** github.com/Ridwannurudeen/backstop
- **Solo project · submission deadline June 21 2026.**

---

## The problem & thesis

Sui's only backstop today is an **emergency validator bailout.** When the $223M Cetus exploit hit (May 2025), the "insurance" was a vote by **validators representing 90.9% of stake** to move the frozen funds on-chain — governance-by-emergency, not a primitive. (blog.sui.io/cetus-incident-response-onchain-community-vote)

It worked once; it doesn't scale, and it quietly breaks the chain's credible-neutrality guarantee. **Sui needs market-priced risk transfer, not emergency votes.** Less than 2% of DeFi is insured ecosystem-wide, and nothing on Sui lets you *price* or *transfer* the crash/depeg risk that actually wipes people out.

---

## What it is

Backstop is **the risk & trust layer for Sui.** Crash insurance is the first product on top of an on-chain **RiskFeed** — a market-implied probability of failure that protocols, treasuries, and agents can consume. A buyer mints a **DOWN binary** on a BTC oracle (pays out if BTC settles below strike at expiry — a crash payout); an underwriter `supply()`s capital to back those payouts and earn premium. Both sides settle trustlessly on DeepBook Predict.

---

## What's live on testnet

Everything below is deployed and executed on Sui testnet. **Canonical full IDs live in [`deployment.json`](./deployment.json)** (object IDs abbreviated here).

- **Live policy mint** (`predict::mint`) — DOWN BTC<$56,901, $10 cover, 0.288596 DUSDC premium · tx `G2X8UFPRjgYf76dA7FBziGg6cyUAkoepGnTuCakzCcBP`.
- **Autonomous AI underwriter** executing `predict::supply` on-chain, sized to its own decision — $100k-capacity market → $10.00 supplied · tx `EcRYQ3dLuATkef6Kv7P6Rj11B7bkriWHqXkRCLk8ogVa`.
- **On-chain RiskFeed package** (`0xefda…cc6ef`, shared object `0xa48b…1ddf4`) — 3 probability-of-failure readings published, each Walrus-linked · tx `Ad5Fcr6otec41vioS5mTPJGY89GaaKcQPdRUZc2bvbEz`.
- **RiskFeed consumer** (`risk_guard`) — a `GuardedTreasury<SUI>` (`0x784e…4ddb6`) whose `withdraw` **reads the live feed** (282bps ≤ 500bps tolerance) and releases funds — proof a protocol consumes the feed. Created · tx `AFMA9saypdJ1sc9UbCcgsrh27MxYxR23jKAwL5ofBYH6`; gated withdraw · tx `7eGTCiTQMsqzZNW519GRRHiv5AUWWu4uyBsuwcsjc8We`.
- **Live risk terminal** — implied-crash-probability curves across strikes, straight from `devInspect` reads.
- **Native parametric CoverPool** (`cover_pool`) — LPs supply SUI, buyers get crash cover priced live off the RiskFeed, claims settle from the pool. Crash→payout proven on-chain · claim tx `6zaXyBYjTduAYXUQGHjE6dAvLHX5t7muKRANTgpH6p2P`.
- **Agent accountability** (`accountability`) — a bonded, slashable `AgentPassport` + a public `CalibrationLedger` scoring predictions vs realized outcomes (100% over 2 settled) · register tx `6JCzQfVvrA2dfhEQVnebLPFcTRrFqFzxYCN4SXrisJTo`, settle tx `GAdig2CpDouXXnEpW934F9HpjbWodm7g9GLj5whGqHoP`.
- **Backstop network** — an on-chain `PoolRegistry` (pool directory) + a `lending_demo` consumer whose reserve is backstopped by a CoverPool claim on a crash · cover_shortfall tx `9ASNW2B4FAthT5aw8x8gpcwwgq75mDm8TtjWoRNLMxqp`.

Verify any digest at `https://testnet.suivision.xyz/txblock/<digest>`; read any Walrus decision at `https://aggregator.walrus-testnet.walrus.space/v1/blobs/<blobId>`.

---

## The demo spine

**DeepBook quote → AI decision → Walrus proof → on-chain RiskFeed → RiskGuard consumer (withdraw gated on the live feed) → mint/supply tx.**

---

## How to run

Node v24 + npm.

- **App:** `cd app && npm install && npm run dev` (Risk terminal + AI underwriter work with no wallet).
- **Agent:** `cd agent && npm install && npm run once` (one cycle: read oracles → price → decide → log to Walrus).
- **Contracts:** `sui move test`.

---

## Tech

- **DeepBook Predict** — `get_trade_amounts` on a DOWN binary reads price-per-unit as the **market-implied probability of failure** (a risk-neutral probability oracle); SVI vol surface, internal market maker, <400ms settlement.
- **Walrus** — tamper-evident decision memory: every reading (inputs, SVI snapshot, decision, realized outcome) is content-addressed and independently retrievable. Trust comes from a **public calibration ledger** comparing past predictions to outcomes, so anyone can audit the oracle's accuracy.
- **Move** — the on-chain `RiskFeed` package + `risk_guard` consumer that any Sui protocol can read to back its own solvency.
- **Claude underwriter** — Node agent prices capacity + premium (Claude in the loop, deterministic-rules fallback) and supplies on-chain sized to its own decision.

---

## Honest live-vs-roadmap

**Live now:** live quotes, risk terminal, AI underwriter, Walrus proof (all read-only, no wallet); the on-chain `RiskFeed` oracle + `risk_guard` consumer; the agent executing its own underwriting on-chain; live policy mint; the native parametric **CoverPool** (mutualized capital + on-chain claims); the **AgentPassport** bond + **CalibrationLedger**; the **PoolRegistry** and the **lending_demo** consumer (protocol cover). **Roadmap (not shipped):** multi-asset + stablecoin-depeg markets, an underwriter marketplace, mainnet deploy once DeepBook Predict ships to mainnet.

Full 6-phase roadmap (Proof → Risk Oracle → Backstop pool → Backstop network → Provenance standard → Agent accountability + cross-chain) in [`ROADMAP.md`](./ROADMAP.md).
