# Backstop — Pitch Deck

> **Status: pre-launch / Sui testnet.** Everything labeled "live" is deployed and executed on Sui testnet (DeepBook Predict + Walrus), verifiable on-chain. Everything labeled "roadmap" is forward-looking. All Backstop adoption/capital figures are **targets**, not traction. Ecosystem/market figures are externally sourced and dated.
>
> Sui Overflow 2026 · solo project · submission June 21 2026 · live testnet: **https://backstop.gudman.xyz**
> Rubric mapping per slide — Real-world application 50% · Technical 20% · UX 20% · Vision 10%.

---

## Slide 1 — Backstop

**The risk & trust layer for Sui.**

- Crash insurance priced by DeepBook Predict, proven on Walrus.
- *Insure your treasury against a crash in one click — priced live off an on-chain options oracle, underwritten by an autonomous agent, settled trustlessly in <400ms.*
- Live on testnet: **https://backstop.gudman.xyz** (Risk terminal + AI underwriter are public, no wallet needed).
- Sui Overflow 2026 · DeepBook track (primary) · cross-listing Agentic Web + Walrus · solo.

*Speaker note: Open with the one-liner, then say the URL is live and judges can click it right now — the read-only tabs work without a wallet.*

---

## Slide 2 — The problem *(Real-world, 50%)*

**Sui can execute and store. It cannot price or transfer risk.**

- May 2025: a **$223M exploit** hit Sui's largest DEX (Cetus). The backstop wasn't insurance — it was a **90.9% validator vote to freeze and roll back $162M**. Governance-by-emergency, not a primitive. (Cyfrin, Decrypt)
- Root cause: a silent overflow in a **shared `integer-mate` library multiple protocols depended on** — a correlated, ecosystem-wide single point of failure.
- **No Sui-native risk-transfer primitive exists.** Lending markets socialize losses onto depositors ad hoc; DeepBook Margin docs don't define who eats bad debt. (Suilend, docs.sui.io)
- **<2% of DeFi value is insured ecosystem-wide**, and the leader only sells hack cover — not the crash/depeg risk that actually wipes people out. (CryptoSlate)

*Speaker note: The validator-rollback line is the hook — it worked once, it doesn't scale, and it quietly breaks Sui's credible-neutrality guarantee.*

---

## Slide 3 — The insight *(Technical, 20%)*

**Predict is the price of risk. Walrus is verifiable truth. Backstop is both.**

- DeepBook Predict's on-chain volatility surface **is** a market price of risk — Block-Scholes-grade SVI, <400ms settlement, internal market maker.
- A **DOWN-binary's price = the market-implied probability of failure** (risk-neutral). Read it straight from `get_trade_amounts`.
- Walrus anchors every reading — inputs, the SVI snapshot, the decision, the realized outcome — content-addressed and independently retrievable.
- That makes the oracle **trustless by construction**: anyone can audit its calibration. No off-chain risk vendor can offer that.

*Speaker note: This is the technical kernel — Backstop is the only project on either chain reading Predict as a risk oracle (verified in agent/src/pricing.ts).*

---

## Slide 4 — What it is

**Crash insurance — the first product on a risk-and-trust layer.**

- Buyer mints a **DOWN binary** on a BTC oracle; it pays out if BTC settles below the strike at expiry (a crash payout).
- Underwriter `supply()`s capital to the vault to back those payouts and earn premium. Both sides settle trustlessly on Predict.
- Built as a layer, not an app: live probability-of-failure feed, an autonomous underwriter, a live risk terminal, and an on-chain `RiskFeed` oracle any Sui protocol can read.
- Insurance is the wedge; the primitive underneath is "price and prove risk for the whole ecosystem."

*Speaker note: Frame it as hedging, never gambling — trustless oracle settlement is the credibility anchor.*

---

## Slide 5 — How it works *(UX 20% + Technical 20%)*

**One click to insure. Trustless to settle. Two-sided by design.**

- **Buy** = mint a DOWN binary; premium priced **live** via `get_trade_amounts` off the on-chain vol surface (not set by us).
- **Settle** = the oracle settles trustlessly in **<400ms** — no claims adjuster, no counterparty.
- **Redeem** = `redeem_permissionless` pays the buyer instantly if BTC is below strike.
- **Underwrite** = `supply()` capital into the vault to back policies and earn the premium.

*Speaker note: The whole loop — quote, mint, settle, redeem, supply — is the same client-side PTB set verified live on 2026-06-07.*

---

## Slide 6 — Live on testnet *(Real-world, 50% — the load-bearing slide)*

**Real transactions, on-chain, verifiable — not a mock.**

- **Live insurance mint** — DOWN BTC<$56,901, $10 cover, **0.2886 DUSDC** premium · tx `G2X8UFPRjgYf76dA7FBziGg6cyUAkoepGnTuCakzCcBP`.
- **Autonomous AI underwriter** executes `predict::supply` **on-chain, sized to its own decision** (capacity-proportional): $100k-capacity market → **$10.00 supplied** · tx `EcRYQ3dLuATkef6Kv7P6Rj11B7bkriWHqXkRCLk8ogVa`.
- **On-chain `RiskFeed` contract** (Move package `0xefda…cc6ef`, shared object `0xa48b…1ddf4`) — **3 probability-of-failure readings published**, each Walrus-linked · tx `Ad5Fcr6otec41vioS5mTPJGY89GaaKcQPdRUZc2bvbEz`.
- **Live risk terminal** — implied-crash-probability curves across strikes, straight from `devInspect` reads.
- All verifiable: any digest on `testnet.suivision.xyz`, any decision on the Walrus aggregator.

*Speaker note: This is the slide that wins the 50% axis — every claim has an on-chain or Walrus address behind it. Full canonical IDs are in deployment.json.*

---

## Slide 7 — The honest two-sided market

**Not a one-way demo — a real market with both sides on-chain.**

- **No crash:** BTC holds above strike → the premium flows to the **underwriter** (the agent's real on-chain PLP position).
- **Crash breaches strike:** the **same** `redeem_permissionless` call pays the **buyer** instantly.
- Both sides settle on-chain via the oracle — buyer and underwriter, real positions, real premium.
- Honest caveat: a *guaranteed* in-the-money payout can't be staged (the Predict maker refuses an in-the-money ask via `assert_mintable_ask`) — so we show the real settled position + the live redeem code path.

*Speaker note: Lead with "the premium really flowed to the underwriter on-chain" — it proves the market is two-sided, not a scripted payout.*

---

## Slide 8 — Roadmap *(Vision, 10%)*

**Read-only public good → ecosystem backstop → trust standard.**

- **Phase 0 — Proof (now):** crash/depeg pricing + AI underwriter + Walrus ledger + risk terminal. ✅ live testnet.
- **Phase 1 — Risk Oracle:** on-chain `RiskFeed` per asset/protocol with Walrus-verified calibration history (read-only, ships with no capital).
- **Phase 2 — Backstop pool / depeg:** mutualized cover for a partner protocol + stablecoin depeg insurance (**mainnet-gated**).
- **Phase 3 — Backstop network:** liquidation backstops + bad-debt + protocol cover; underwriting-as-yield for LPs.
- **Phase 4 — Provenance standard:** attestation + verifiable index over Walrus; embedded risk/trust API.
- **Phase 5 — Agent accountability + cross-chain:** agent bonding, insurance, Walrus-anchored reputation passports; cross-chain risk via Ika.

*Speaker note: Be explicit — Phase 2+ depend on DeepBook Predict reaching mainnet ("later 2026"). Each phase still ships a working product.*

---

## Slide 9 — The moat

**A track record no latecomer can backfill.**

- **Verifiable calibration ledger:** every prediction + realized outcome is Walrus-anchored from day one. Trust in a risk oracle is *earned over time and provable* — you cannot retroactively fake a track record. Deepest moat in the thesis.
- **Dual-ecosystem necessity:** the product structurally requires **both** Predict (price of risk) and Walrus (verifiable truth) — neither delivers it alone.
- **Standards & network effects:** the risk parameters protocols import, the provenance builders attest to, the passport agents accumulate — standards moats, winner-take-most.
- **Data flywheel:** more volume → better pricing → cheaper capital → more volume.

*Speaker note: The calibration ledger is the line to land — a competitor launching in 2027 starts at zero provable history while Backstop has a year of it.*

---

## Slide 10 — Why Sui & Mysten want this

**It builds the primitive the ecosystem already admits it's missing.**

- Removes the chain's most embarrassing dependency — **the validator bailout** — and replaces it with a priced market.
- The canonical showcase that **Predict + Walrus together** enable something neither does alone.
- The precondition for the **institutional + RWA wave** — tokenized assets won't come on-chain uninsured.
- The missing **accountability layer for the agent economy** Sui itself calls "still early."

*Speaker note: Backstop isn't asking permission — it's building what Sui's own blog posts say is missing.*

---

## Slide 11 — Close

**Backstop — the risk & trust layer for Sui.**

- Pricing risk with DeepBook Predict, proving it with Walrus — the two primitives Sui was missing.
- **Live on testnet:** https://backstop.gudman.xyz (Risk terminal + AI underwriter, no wallet).
- On-chain proof: insurance mint, agent-supplied capital, published `RiskFeed` readings — all in `deployment.json`.
- Solo build · Sui Overflow 2026 · submission June 21 2026.

*Speaker note: End on the URL and the one-liner — invite judges to click the live testnet and verify any digest themselves.*
