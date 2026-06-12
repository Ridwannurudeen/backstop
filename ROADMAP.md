# Backstop — The Risk & Trust Layer for Sui

**Not an insurance app. The two primitives Sui and Walrus are missing: a way to *price* risk and a way to *prove* truth.**

> Status: pre-launch. Working testnet primitives on Sui / DeepBook Predict + Walrus. Every ecosystem gap below is sourced and dated; every Backstop metric is a **target**, not traction. Forward-looking.

---

## 0. The reframe

Every functioning economy runs on two things crypto still lacks natively: the ability to **price risk** (insurance, credit, derivatives) and the ability to **prove truth** (provenance, audit, reputation). Sui has world-class *execution* (DeepBook, sub-400ms settlement) and a *storage* layer (Walrus) — but the **risk and trust layers on top of them barely exist.** Backstop builds exactly that layer. Insurance is just the first product on it.

**One line:** *Backstop turns DeepBook Predict's on-chain volatility surface into a live, market-priced probability of failure for any asset or protocol — every reading provably logged on Walrus — so the whole ecosystem can price, transfer, and trust risk as a public good.*

---

## 1. The hole is real, urgent, and ecosystem-wide (all verified)

**Sui's only backstop today is a validator bailout.** When the **$223M Cetus exploit** hit (May 2025), the "insurance" was a **90.9% validator vote to freeze and roll back $162M** — *governance-by-emergency, not a primitive.* It worked once; it doesn't scale, and it quietly breaks the chain's credible-neutrality guarantee. Root cause was a silent overflow in a **shared `integer-mate` library that multiple protocols depended on** — correlated, ecosystem-wide single point of failure. ([Cyfrin](https://www.cyfrin.io/blog/inside-the-223m-cetus-exploit-root-cause-and-impact-analysis), [Decrypt](https://decrypt.co/321544/sui-200-million-dex-oracle-manipulation-attack))

The rest of the risk stack is missing too:
- **No Sui-native risk-transfer primitive at all.** Nexus Mutual/InsurAce have no Sui deployment; lending markets (Suilend, NAVI) handle insolvency by **socializing losses onto depositors** ad hoc. DeepBook Margin's own docs don't define who eats bad debt. ([Suilend risks](https://docs.suilend.fi/security/risks), [DeepBook Margin](https://docs.sui.io/standards/deepbook-margin))
- **Concentration = systemic fragility.** ~90% of Sui perp volume sits in one venue (Bluefin); **86% of USDY in Cetus, 76% of AUSD in Suilend** ([Artemis](https://www.artemisanalytics.com/resources/the-state-of-stablecoins-on-sui)). One incident is simultaneously a liquidity event, a depeg event, and a contagion event.
- **<2% of DeFi value is insured ecosystem-wide**, and the leader (Nexus) covers 0.14% of DeFi and only sells *hack cover* — not the price/depeg risk that actually wipes people out ([CryptoSlate](https://cryptoslate.com/nexus-mutual-surpasses-1-of-total-defi-tvl-as-insurance-market-heats-up/)).

And the *trust* layer (Walrus) has the mirror-image gap:
- **Walrus proves bytes are unchanged — not that they're true or from whom they claim.** "Verifiable" today = tamper-evidence, **not provenance.** Walrus's own Haulout hackathon ran a whole "Provably Authentic" track because the primitive is missing ([Walrus](https://blog.walrus.xyz/haulout-hackathon-winners-2025/)).
- **The "decentralized memory" has a centralized brain.** MemWal's recall runs on an off-chain **Postgres index via a relayer that sees plaintext** — and the agent-memory API has **no provenance, trust-tiers, revocation, or deletion** (verified against the MemWal repo). Seal can't revoke a key once retrieved and emits **no on-chain audit of who decrypted**.
- **Both ecosystems are betting everything on an agent economy that has no accountability primitive.** Sui itself calls on-chain identity/reputation "underdeveloped" and agentic commerce "still early" ([Sui](https://blog.sui.io/ai-agents-agentic-commerce-trust-layer/)). There is no way to bond an agent, insure against a rogue one, or prove its track record.

**Synthesis: Sui can execute and store, but it cannot price risk or prove truth. That is the single biggest thing standing between Sui and institutional-grade, agent-driven finance.**

---

## 2. What Backstop already is (the unlock — verified working today)

Backstop is the only project on either chain reading **DeepBook Predict as a risk oracle.** Its agent calls `get_trade_amounts` on a DOWN binary and reads **price-per-unit = the market-implied probability of failure** (verified in `agent/src/pricing.ts`, live on testnet). It then anchors every reading — inputs, the on-chain SVI vol-surface snapshot, the decision — to **Walrus, content-addressed and independently retrievable** (round-trip verified 2026-06-07).

That combination is a **risk-truth primitive**, not an app:
- **Predict supplies the price of risk** (the only on-chain implied-vol surface, Block Scholes-grade, <400ms settlement, internal market maker).
- **Walrus supplies tamper-evident decision memory** (content-addressed, independently retrievable) — and on top of it the agent keeps a **publicly auditable record of every past prediction and its realized outcome.** Trust isn't asserted; it's **earned on a public calibration ledger** anyone can replay against realized outcomes over time — provable, not assertable. No off-chain risk vendor can offer that.

It ships **read-only, today, with no capital, no claims, no governance** — so the demo is real, not a mock.

---

## 3. Three pillars — each solving a foundational, verified gap

### Pillar I — The Risk Engine for all of Sui DeFi *(solves: no priced risk-transfer; validator-bailout-as-backstop)*
A neutral, market-priced solvency layer any protocol plugs into: a live **probability-of-failure feed** (read-only, shippable now) → **liquidation backstops, bad-debt cover, and protocol cover** funded by a mutualized pool. Replaces "90.9% validator vote" with a *priced market* that pre-funds tail risk. This is the primitive that makes Sui DeFi institution-safe.

### Pillar II — The Verifiable Truth & Provenance Layer *(solves: Walrus has tamper-evidence, not provenance/accountability)*
Backstop's Walrus-anchored, outcome-verified ledger is the **reference implementation of provenance + accountability** the ecosystem is missing. Generalized, it becomes a **provenance/attestation + verifiable-risk-data standard** and a **trust-minimized index** over Walrus — fixing the "centralized brain" problem and giving any builder signed origin, audit trail, and revocation that MemWal/Seal don't.

### Pillar III — The Accountability Layer for the AI Agent Economy *(solves: no agent identity/reputation/bonding)*
Backstop *is itself* a bonded, auditable agent that writes a verifiable decision trail to Walrus — the reference for what a trustworthy agent looks like. It extends to **bond and insure autonomous agents** and issue each a **Walrus-anchored "agent passport" + verifiable track record** — the missing primitive that lets the agent economy both chains are betting on actually transact with recourse.

---

## 4. Roadmap — read-only public good → ecosystem backstop → trust standard

Each phase ships working product. KPIs are **targets.**

| Phase | Ships | Solves | Milestone (target) |
|---|---|---|---|
| **0 — Proof (now)** | Crash/depeg pricing + AI underwriter + verifiable Walrus ledger + risk terminal | Demonstrates the risk-truth primitive | Live testnet MVP ✅ |
| **1 — Risk Oracle (read-only)** | On-chain `RiskFeed` object: market-implied probability of failure per asset/protocol, with Walrus-verified calibration history | No canonical risk/probability oracle on Sui | First protocols consuming the feed; public accuracy ledger |
| **2 — Backstop pool** | Mutualized cover for one partner protocol (the capital lane) + stablecoin depeg insurance on mainnet | No priced risk-transfer; validator-bailout | First $1M+ coverage; design-partner DAOs |
| **3 — Backstop network** | Liquidation backstops + bad-debt + protocol cover any Sui protocol plugs into; underwriting-as-yield for LPs | Systemic, cross-protocol solvency | $50M+ underwriting capital; multi-protocol |
| **4 — Provenance & trust standard** | Provenance/attestation + verifiable index over Walrus; embedded risk/trust API | Walrus provenance + accountability gap | Adopted as a data-trust standard |
| **5 — Agent accountability + cross-chain** | Agent bonding, insurance, and Walrus-anchored reputation passports; cross-chain risk via Ika | Agent-economy accountability; cross-chain risk | The trust layer for autonomous agents |

---

## 5. Why this is defensible (the moat compounds)

1. **A verifiable calibration ledger no one can fake retroactively.** Every prediction + realized outcome is Walrus-anchored from day one. Trust in a risk oracle is *earned over time and provable* — a latecomer can't backfill a track record. This is the deepest moat in the entire thesis.
2. **Dual-ecosystem necessity.** The product *structurally requires both* Predict (price of risk) and Walrus (tamper-evident decision memory) — it's the canonical showcase of why Sui + Walrus together enable something neither does alone. That alignment makes Mysten/Sui Foundation a natural champion.
3. **Standards & network effects.** Becoming the risk parameterization other protocols import, the provenance standard builders attest to, and the reputation passport agents accumulate are *standards moats*, not feature moats — winner-take-most.
4. **Data flywheel.** More volume → better pricing → cheaper capital → more volume.

---

## 6. Business model & $BACK

Revenue: **risk-feed subscriptions** (Pillar I, capital-free), **take rate on premiums**, **underwriting-vault performance fees**, **embedded risk/trust API** (B2B — the scalable line), **provenance/attestation fees** (Pillar II). $BACK accrues value via fee share, **staking as junior backstop capital** (skin-in-the-game governance), and underwriter incentives — tied to coverage written and feed usage, not emissions.

---

## 7. Why Sui, Walrus, and Mysten *want this to exist*

It removes the chain's most embarrassing dependency (validator bailouts), it's the showcase that proves the Predict + Walrus synergy, it's the precondition for the **institutional + RWA wave** ($16T tokenized by 2030 won't come on-chain uninsured), and it's the missing accountability layer for the **agent economy** they're betting the next cycle on. Backstop isn't asking the ecosystem for permission — it's building the primitive the ecosystem already admits it's missing.

---

## 8. Honest real-vs-aspirational

- **Real today (on testnet):** Predict-as-risk-oracle reads (`pricing.ts`), Walrus-verified logging (round-trip confirmed), crash/depeg pricing, AI underwriter, risk terminal; the on-chain `RiskFeed` — now **decentralized**: bonded multi-publisher, challenge/slash, and **freshness-enforced reads** (`probability_bps_fresh`, adopted by `cover_pool::claim_fresh`) — plus the `risk_guard` consumer; the agent executing its own underwriting on-chain; the native parametric **CoverPool** (mutualized capital + on-chain claims, crash→payout proven); a bonded **AgentPassport** + a public **CalibrationLedger** (predictions scored vs outcomes); a **PoolRegistry** and a **lending_demo** protocol consumer (bad-debt backstopped by a pool claim).
- **Built + mainnet-proven, deploy-pending:** **Pyth-settled stablecoin depeg cover** (`pyth_cover_pool`). Because DeepBook Predict is testnet-only, the production settlement path moves to **Pyth** (live on Sui mainnet): a SUI-collateralized pool whose claim reads a Pyth feed on-chain and pays iff the stablecoin breaks its floor. **8/8 tests against the real Pyth mainnet packages**, the **suiUSDe feed confirmed live on-chain**, and the settlement read **proven end-to-end via mainnet `devInspect`** (no funds). App "Depeg cover" tab + `@backstop/sdk` helpers read it live. The only remaining gate is a funded mainnet deploy.
- **Aspirational (labeled):** multi-asset markets beyond stablecoins, an underwriter marketplace, the generalized provenance standard, and agent reputation passports across chains (Ika).
- **Dependencies:** DeepBook Predict is testnet (mainnet "later 2026") — it remains the testnet *risk oracle*, while mainnet *settlement* now rides on **Pyth** (live on Sui mainnet today). Sui's "verifiable compute" (Nautilus) is AWS-Nitro TEE-attested, **not** cryptographically trustless — we'd document that, not market around it.

---

*Disclaimer: Pre-launch; testnet. Backstop metrics are targets, not results. Market/ecosystem figures are cited with dates — re-verify before live investor use. Not an offer of securities or a token.*

## Sources
Cetus exploit & validator rollback — cyfrin.io; decrypt.co · Sui risk/insurance absence — docs.suilend.fi; docs.sui.io/standards/deepbook-margin · Concentration — artemisanalytics.com · DeFi insured <2% — cryptoslate.com; coindesk.com · DeepBook Predict (SVI/Block Scholes/<400ms/IMM) — blog.sui.io/introducing-deepbook-predict; docs.sui.io/onchain-finance/deepbook-predict · Walrus provenance gap & Haulout — blog.walrus.xyz; MystenLabs/MemWal & MystenLabs/seal repos · Agent trust layer "still early" / identity "underdeveloped" — blog.sui.io/ai-agents-agentic-commerce-trust-layer; sui.io/project-ideas · Nautilus AWS-Nitro TEE — docs.sui.io/concepts/cryptography/nautilus · RWA $16T by 2030 — BCG/Standard Chartered via mintlayer.org · Stablecoins ~$321B — kucoin.com; defillama.com
