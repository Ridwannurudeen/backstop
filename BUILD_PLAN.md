# Backstop — build plan (flagship scope)

**The first real insurance protocol on DeepBook Predict: AI-underwritten, portfolio-level crash protection, powered by the on-chain vol surface.**

One-liner: *"Insure your treasury against a crash in one click — priced by an on-chain options oracle, underwritten by an autonomous agent, settled trustlessly in <400ms."*

- **Tracks:** DeepBook ($35k top) primary; cross-appeal to Agentic Web (AI underwriter) + Walrus (tamper-evident agent memory).
- **Window:** today → **June 21** submission (~14 days), **solo**.
- **Prime directive:** a working, demoable product at *every* checkpoint. Risky pillars have explicit fallbacks. We never trade "it works" for "it's bigger."
- Verified contract constants + signatures live in `spike/ids.ts` and `app/src/lib/predict.ts` (do not re-derive).

---

## Architecture — one coherent protocol, four pillars on a verified foundation

**Foundation (built + live-verified 2026-06-07):** client-side PTBs for buy (DOWN mint), claim (`redeem_permissionless`), underwrite (`supply`→PLP), quote (`get_trade_amounts`, live-priced), manager creation. App typechecks + builds.

**Pillar 1 — Portfolio crash protection** *(real-world wow, 50% axis)*
"Insure my treasury." Read the wallet's on-chain holdings → compute crash/drawdown exposure → one-click build a **basket** of DOWN-binary policies (e.g. protect against −10%/−20%). Adopter: DAOs, funds, treasuries. Turns a single-binary toy into treasury risk management.

**Pillar 2 — Autonomous AI underwriter** *(technical + agentic wow, cross-track)*
A Node agent that: monitors active oracles + vault state; prices risk off Predict's on-chain **SVI vol surface**; uses **Claude** (claude-sonnet-4-6 in the loop; consult the `claude-api` skill at implementation) to produce a grounded accept/decline + risk rationale; manages vault exposure caps; and writes every decision (SVI snapshot → reasoning → action) to **Walrus** as tamper-evident memory. The headline: a *self-driving insurance protocol*.

**Pillar 3 — Live risk terminal** *(visual + technical depth, 20% UX / 20% tech)*
Real-time vol-surface viz from SVI params (a,b,ρ,m,σ), **implied crash probabilities** per strike (binary price = risk-neutral probability — a genuinely Sui-unique on-chain data product), vault solvency/exposure, premium flow.

**Pillar 4 — The 400ms money shot** *(presentation, 10%)*
Live in the demo: buy protection on a short-dated oracle → expiry → **instant on-chain payout**. The moment that ends the video.

---

## 14-day solo schedule — every phase ends demoable

**Days 1–2 (Jun 7–8) — Foundation lock. GATE.**
On a real machine (off the rate-limited sandbox): faucet SUI + request **gated DUSDC** → run `spike/orchestrate.mjs` extended with a real `create_manager` + one real **buy (mint)** + **claim**. Fix any abort (this validates qty semantics + the full round-trip).
*Demoable:* a real policy bought and claimed on testnet. **Do not advance until this is green.**
*Parallelizable now without DUSDC:* Pillar 2 + 3 read-only work (below) — start immediately while DUSDC is pending.

**Days 3–4 (Jun 9–10) — Pillar 1 + two-sided polish.**
Wallet holdings read (`getAllBalances`), exposure calc, basket builder (multi-position mint in one PTB), underwriter UX (supply/withdraw, PLP balance, est. APR).
*Demoable:* "Insure my treasury against a 20% crash" + "Become an underwriter."

**Days 5–7 (Jun 11–13) — Pillar 2, the headline. (highest risk)**
Agent service: poll oracles/vault → price off SVI → Claude risk assessment + accept/decline → execute (supply/exposure mgmt) → log decision to Walrus. Surface agent activity in the UI.
*Demoable:* agent autonomously underwriting with a verifiable Walrus decision log.
*Fallbacks (in order):* (a) deterministic rules-based pricing with Claude only for natural-language risk explanations; (b) keep the agent, drop Walrus logging; (c) cut the agent entirely — the protocol still demos fully without it.

**Days 8–9 (Jun 14–15) — Pillar 3, risk terminal.**
SVI vol-surface chart + implied crash-probability curve + vault exposure/solvency dashboard + premium flow.
*Demoable:* the "Bloomberg terminal for crash risk" screen.

**Days 10–11 (Jun 16–17) — Pillar 4 + integration polish.**
Short-dated-oracle settlement demo (live 400ms payout), end-to-end flow polish, error states, empty states, copy, branding, logo.

**Days 12–13 (Jun 18–19) — Submission assets.**
<5-min demo video (script: treasury at risk → one-click insure → agent underwrites → crash → instant payout → verifiable log), real-world + vision narrative, deck, README, logo (1:1).

**Day 14 (Jun 20–21) — Buffer + submit.** Final fixes, deploy, submit on DeepSurge before the deadline.

---

## Risks & mitigations

1. **DUSDC gated** → resolve Day 1; until then, build Pillars 2 & 3 (read-only, no DUSDC). Demo dies without DUSDC, so this is the #1 priority.
2. **AI agent is the riskiest pillar (solo)** → layered fallbacks above; the agent is *additive*, never load-bearing for a working demo.
3. **Walrus integration unknowns** → spike MemWal/Walrus write+read early (Day 5); fallback = on-chain event log if Walrus slips.
4. **Predict is testnet-only** → demo on testnet; mainnet deploy (for the 50/50 prize tranche) waits on Predict mainnet — see ROADMAP. State this honestly.
5. **"Gambling not insurance"** → always frame as hedging; show a named treasury hedger; trustless oracle settlement is the credibility anchor.
6. **Scope creep** → the prime directive. If a pillar isn't demoable by its phase end, invoke its fallback and move on.

## Path to a winning submission
Real-world: treasury crash-protection with a named DAO hedger (50%). UX: one-click "insure my treasury" + the live terminal (20%). Tech: on-chain SVI surface + AI underwriter + Walrus, all load-bearing on DeepBook (20%). Vision: the insurance layer for on-chain finance, mainnet + depeg roadmap (10%).
