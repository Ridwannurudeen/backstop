# Backstop → Production: closing the gaps to the best depeg/crash insurance app on Sui

Status: planning. Owner: Backstop. Last updated: 2026-06-16.

This is the concrete, verified engineering plan to turn Backstop's depeg-cover MVP
into a production-grade, **fully interactive** insurance protocol on Sui. It is
grounded in (a) a source read of the current contracts/app and (b) primary-source
research into Pyth-on-Sui, production insurance design, and Sui Move production
patterns. Sources are cited inline; unverified items are flagged explicitly.

---

## 0. Where we actually are (verified)

**The primitive is sound but MVP-grade.** `contracts/pyth_cover_pool` is a
fully-collateralized (`value(funds) >= total_cover`), parametric, Pyth-settled pool
with a freshness-bounded read (`get_price_no_older_than`) and a breach-latch. That
core is architecturally close to Y2K Finance / Risk Harbor and is the right base.

**It is not yet a standard protocol.** Verified gaps (read from
`pyth_cover_pool.move` this session):

| # | Gap | Evidence | Severity |
|---|-----|----------|----------|
| G1 | Settles on a **single instantaneous** Pyth read — a transient wick or one manipulated update pays out | `do_latch`: `assert!(price_mag <= threshold)` at one moment | Critical — ✅ closed (dwell: two sub-threshold reads `min_dwell_secs` apart) |
| G2 | **Ignores the Pyth confidence interval** (`conf`) | `read_price_magnitude` reads only `get_price`, never `get_conf` (grep: no `conf`) | High — ✅ closed (PR #25: adverse-bound `price+conf<=threshold` + `max_conf_bps` reject) |
| G3 | **Flat `premium_bps`** set at pool creation; no utilization curve, no cooldown → adverse selection (buy cover at the moment of depeg) | `premium_for = cover * premium_bps / 10_000` | Critical (economic) — ✅ closed (cooldown via `activation_delay_secs`; utilization curve `rate = premium_bps + surge_premium_bps * (total_cover+cover)/pool_value`) |
| G4 | **No admin / pause / governance / timelock**; `premium_bps`/`threshold`/`max_age` frozen at creation | grep: no `pause`/`AdminCap`/`owner` | High |
| G5 | **No treasury fee** — 100% of premium to LPs, protocol not sustainable | — | Medium |
| G6 | **No exposure caps** (per-policy / per-pool) on a fully-correlated single-feed risk | — | High |
| G7 | **UpgradeCap** would sit in a hot EOA (the deployer) | `deployPackage.ts` transfers UpgradeCap to sender | High |
| G8 | **No keeper incentive** to record a breach during the dip (Pyth is pull-based) | `record_breach` is permissionless but unrewarded | Medium |
| G9 | **Not deployed to mainnet, no audit, no formal verification** | `deployment.json` has no pyth/mainnet entry | Gating |
| G10 | **Agent can overwrite the live public feed with `[]`** on an empty/all-failed cycle | `index.ts:162`+`:246` `persist()` writes unconditionally | High (live demo) |
| G11 | **Risk terminal defaults to soonest/0d term** → no curve on load; term options labeled by ambiguous `Nd` | `RiskTerminal.tsx:46` (idx 0); `predict.ts:202` soonest-first, no quoteability filter | Medium |
| G12 | **App bundle ~632 kB** (no route-level code splitting) | single eager chunk in `App.tsx` | Medium |

(G10–G12 were surfaced by an independent Codex audit and verified against source this session.)

**The app is mostly read-only for the production product.** Verified map: every
**interactive** flow (Buy Protection, Treasury, Cover Pool, Underwrite, Claim) is
on **testnet** and built on DeepBook **Predict**. The **mainnet depeg product has
no interactive UI at all** — the "Depeg cover" tab is **read-only**. The SDK already
exposes the write-builders (`buildDepegBuyCoverTx`, `buildDepegRecordBreachTx`,
`buildDepegClaimLatchedTx`) — they are simply not wired
to a wallet-connected UI. dapp-kit (`ConnectButton`, `useSignAndExecuteTransaction`)
is already used by the testnet tabs, so the pattern exists.

---

## 1. Design decisions (verified, with rationale)

### 1.1 Oracle robustness (closes G1, G2)
- **Use the confidence band, not the point price.** For a payout require the
  *adverse* bound below the floor: `price + conf <= threshold`. Pyth's official
  best-practice is to discount toward the adverse edge of the `price ± conf` band
  (conf ≈ 1σ). Also **reject** a read when `conf/price` exceeds a bound
  (`max_conf_bps`, e.g. 2%) — never settle while Pyth itself signals high
  uncertainty. (docs.pyth.network/price-feeds/core/best-practices; `price.move`.)
- **Sustained trigger (dwell), not a single read.** There is **no native on-chain
  TWAP on Sui** — must be built on top. Extend the latch into a dwell requirement:
  store `first_breach_ms` + a confirm count; `claim` pays only after a *second*
  confirming sub-threshold read at least `min_dwell_secs` later. Converts a wick into
  a required sustained depeg. (Verified: no Sui TWAP; EMA exists but lags ~1h.)
- **Optional EMA cross-check** for large covers: also require
  `price_feed::get_ema_price` (the ~1h inverse-confidence-weighted EMA) below a looser
  floor. Reached via `price_info::get_price_feed` → `price_feed::get_ema_price`; check
  its own timestamp for freshness (no `_no_older_than` wrapper exists).
- Keep `get_price_no_older_than`; tighten `max_age_secs` to ~30–60s for settlement.

### 1.2 Economics (closes G3, G5, G6)
- **Activation delay / cooldown.** ✅ **Done** — a freshly bought policy cannot record
  a breach until `buy_ms + activation_delay_secs` (pool param; `do_latch` asserts
  `now >= activation_ms`, `buy_cover` rejects `expiry <= activation`). Kills "buy cover
  at the instant of depeg" — the single largest economic hole. (Mirrors Y2K's epoch
  pre-commitment.)
- **Utilization-based premium.** ✅ **Done** — `premium_for` now prices on a curve:
  `rate = premium_bps + surge_premium_bps * utilization`, where utilization is the
  post-trade `(total_cover + cover) / pool_value` (clamped to 1). The marginal buyer
  pays for the capacity they consume, so price rises as the pool fills during a depeg
  scare and falls again as cover expires/claims free capacity — a state-driven
  reversion toward the floor (vs. Nexus's wall-clock daily decay; constants
  calibratable per pool). SDK `quoteDepegPremium` mirrors it off-chain.
- **Exposure caps.** `max_cover_per_policy` and a global per-pool cap; **keep full
  collateralization** — for a single-feed (fully correlated) depeg, fractional
  leverage is unsafe (every policy triggers at once). Do **not** copy Nexus 2:1
  leverage here.
- **Treasury fee.** Split a protocol fee off each premium into a treasury balance for
  sustainability + keeper funding.

### 1.3 Safety & governance (closes G4, G7)
- **AdminCap + pause** — gate `deposit_lp`/`buy_cover` with a pause flag, but the
  **claim / settlement path must be pause-exempt** so a guardian can never block
  payouts during a depeg (the first centralization finding an auditor raises).
- **Timelocked parameter updates** for `threshold`, premium params, `max_age_secs`,
  caps — no silent live changes under LPs/holders.
- **UpgradeCap → multisig + timelock policy** in a *separate, immutable* package; lock
  the policy right after publish; ratchet to `Additive`/`Dependency-only` once stable.
  (docs.sui.io/build/custom-upgrade-policy.)
- **Visibility sweep** — audit every `public` fn; keep internal helpers
  `public(package)`/private (the #1 real Sui exploit class — OpenZeppelin Sui bug
  patterns). Current helpers (`read_price_magnitude`, `do_latch`, `settle`)
  are already private — keep new ones so.

### 1.4 Keeper (closes G8)
- Pay a **keeper bounty / gas rebate** from the treasury (or a slice of the pool) to
  whoever posts the fresh Pyth update and arms the dwell latch, so breaches are
  reliably recorded during the dip.

### 1.5 Interactive mainnet app (the explicit requirement)
The product becomes a **wallet-connected mainnet dApp**, not a read-only display:
- **Buy cover** — connect wallet → pick feed/threshold/cover/term → one PTB
  (`updatePriceFeeds` + `buy_cover`) → receive a `Policy` object. Live premium quote
  from the new utilization curve.
- **Provide liquidity** — `deposit_lp` / `withdraw_lp`, showing pool TVL, utilization,
  APR-from-premiums, and the full-collateralization headroom.
- **Settle a claim** — "Record breach" + "Claim" buttons that build the trustless
  one-PTB Pyth-update-then-settle flow; show dwell progress and payout.
- **My policies / My LP** — live positions, status, claimable state.
- **"Protect this position" widget** — read a real NAVI or Suilend **suiUSDe** position
  via their public SDK (`navi-sdk`) and size a policy to it. This is the credible,
  **unilateral** path to "1 real integration" (no partner sign-off needed).

### 1.6 Asset / threshold
- v1 insures **suiUSDe/USD** — the live mainnet Pyth `PriceInfoObject`
  (`0x9b2028…d63f`, expo −8) was **verified readable this session**. Offer **USDe/USD**
  as a sibling (longer feed history, documented Oct-11-2025 depeg).
- **Calibrate the threshold to Pyth's *aggregate* behaviour**, not the worst
  single-venue print. USDe's Oct 11 2025 dislocation was ~$0.65 on one venue but
  ~$0.94–0.97 on aggregate; a Pyth-fed trigger tracks the aggregate. Backtest the feed
  against that window before fixing `threshold`. (Flagged: confirm Pyth publishes a
  *suiUSDe* feed vs only USDe before pinning params for the suiUSDe pool.)

---

## 1.6 Merged execution plan (Backstop research × Codex audit)

An independent Codex audit reached the **same `pyth_cover_pool` v2 hardening list**
(confidence band, dwell trigger, cooldown, utilization pricing, caps, fee, keeper,
claim-exempt pause, timelock, multisig UpgradeCap) — independent convergence, high
confidence. It added three things this plan adopts: (a) real live-app **defects**
(G10–G12), (b) a **no-wallet simulator** as the bridge from read-only to interactive,
and (c) **making `/depeg` the primary product surface**. This plan keeps its own
edge: the verified Pyth mechanics, the parameter-calibration table, the capital-model
reasoning (no leverage on a correlated single-feed risk), and the custody/audit
specifics. Merged sprint order:

- **Sprint 0 — quick wins (now, no funds):** fix G10 (never overwrite a good feed
  with `[]`; scan until N valid decisions), G11 (default to first liquid term, label
  by date), G12 (route-level code splitting). Protects the live demo.
- **Sprint 1 — make `/depeg` the product (now, no funds):** no-wallet **simulator**
  (asset/coverage/floor/term → premium, payoff, settlement path → "Connect to
  execute") → then wallet-connected mainnet **buy / LP / record-breach / claim** +
  "My policies / My LP", wiring the SDK `buildDepeg*` builders (devInspect-verified).
- **Sprint 2 — contract v2 hardening (now, no funds, parallel):** §1.1–1.4 — oracle
  hardening first (confidence band + dwell), then economics + governance, with full
  tests + Sui Prover. UI tracks the v2 API.
- **Sprint 3 — mainnet deploy + custody (funds-gated):** deploy v2, UpgradeCap →
  multisig + timelock policy, first live buy → dwell → claim.
- **Sprint 4 — assurance + polish:** audit, first real integration, proof-health
  badges, replayable accountability (decision → blob → on-chain reading → outcome →
  Brier).

The detailed protocol phases below (§2) are the engineering reference for Sprints 2–4.

## 2. Roadmap (phased, with gating)

Each phase says what is **buildable now (no funds)** vs **funds/approval-gated**.
The Sui Overflow submission (Jun 21) is a near-term checkpoint; this plan is the
production path beyond it.

### Phase 0 — Spec & calibration · *buildable now*
- Backtest suiUSDe/USDe Pyth feed vs Oct 2025; pick `threshold`, `max_conf_bps`,
  `min_dwell_secs`, `activation_delay`, premium curve constants, caps.
- Write the `pyth_cover_pool` v2 spec (state, errors, invariants) + a parameter table.
- **Acceptance:** reviewed spec + a backtest script (`agent/src/backtestDepeg.ts`)
  printing what would/wouldn't have triggered.

### Phase 1 — Contract hardening (`pyth_cover_pool` v2) · *buildable now, no funds*
Additive, behaviour-preserving where possible; new state fields + new entry funcs.
- Confidence band + `max_conf_bps` reject (G2).
- Dwell-based sustained trigger extending the latch (G1).
- Activation delay on `buy_cover` (G3).
- Utilization premium curve replacing flat `premium_bps` (G3).
- Per-policy + per-pool exposure caps (G6).
- `AdminCap` + pause (claim-exempt) + timelocked param setters (G4).
- Treasury fee split + keeper bounty (G5, G8).
- Full unit tests (happy + each abort + adverse-bound + dwell + cooldown + cap +
  pause-exempt-claim) via `.tools/sui.exe move test`.
- **Sui Prover** proof of `value(funds) >= total_cover` and share accounting.
- **Acceptance:** all tests green; prover invariant proven; consumers
  (`pyth_lending_demo`) updated to the v2 API and green.

### Phase 2 — Interactive mainnet app · *buildable now; live txs need a funded wallet*
- Mainnet `SuiClient` + dapp-kit wallet wiring for the depeg product (reuse the
  testnet tabs' `ConnectButton`/`useSignAndExecuteTransaction` pattern).
- Interactive flows: Buy cover, Provide/withdraw liquidity, Record-breach + Claim,
  My policies / My LP — all calling the SDK's `buildDepeg*` builders (extended for
  v2: quote, cooldown state, dwell progress).
- "Protect this position" widget reading a real NAVI/Suilend suiUSDe position.
- **Acceptance:** every flow builds a valid PTB and signs on mainnet in a wallet
  (devInspect-verified where no funds); UI typecheck + build clean; deployed to
  backstop.gudman.xyz.

### Phase 3 — Mainnet deploy + custody · *funds/approval-gated*
- Deploy v2 (`pyth_cover_pool` + updated `pyth_lending_demo`) to mainnet via the
  wired `DEPLOY_NETWORK=mainnet` path (`DEPLOY.md`).
- Move `UpgradeCap`/`AdminCap` to a **Sui multisig**; publish the timelock policy
  package; lock the policy.
- Seed a real suiUSDe pool; first live buy → dwell → claim (stageable now via a
  threshold-above-spot demo pool, per `DEPLOY.md`).
- **Acceptance:** live mainnet pkg ids in `deployment.json`; one real on-chain
  buy/claim digest; caps wired to multisig.

### Phase 4 — Assurance & first integration · *partly external*
- External audit (OtterSec / Zellic / MoveBit tier) + fix cycle.
- Testnet/mainnet soak with the real feed + a bug bounty.
- Ship the "1 real integration" — a live policy against a real NAVI/Suilend suiUSDe
  position.
- **Acceptance:** audit report addressed; one external user/integration live;
  conservative caps in force.

### Phase 5 — Scale · *later*
- Multi-asset pools (USDC/USDT/sUSDe), junior backstop tranche for capital efficiency
  (not leverage), an incentivized keeper network, and progressive governance
  decentralization.

---

## 3. Parameters to calibrate (Phase 0 output)

| Param | Purpose | Starting point (calibrate!) |
|-------|---------|------------------------------|
| `threshold` | depeg floor | $0.97 @ expo −8 (= 97_000_000); backtest |
| `max_conf_bps` | reject wide-band reads | ~200 bps (2%) |
| `min_dwell_secs` | sustained-breach window | 5–15 min (calibrate to feed volatility) |
| `confirm_count` | breach observations required | 2 |
| `activation_delay` | anti-adverse-selection cooldown | 30–60 min |
| `max_age_secs` | settlement freshness | 30–60 s |
| premium curve | utilization slope + daily decay + floor | Nexus template: +0.2%/1% capacity, −2%/day |
| `max_cover_per_policy`, global cap | exposure limits | size to seeded capital |
| treasury fee | sustainability | 5–10% of premium |
| keeper bounty | breach-recording incentive | small fixed + gas rebate |

All starting points are **templates from cited protocols, not tuned for Sui** —
Phase 0 backtesting fixes them.

---

## 4. Risk register

- **Oracle:** single-source Pyth. Mitigate with confidence band + dwell + freshness;
  consider a second feed cross-check before large caps. No on-chain trading-status
  flag on Sui — staleness is the liveness gate.
- **Economic:** correlated single-feed claims → keep full collateralization + caps;
  never leverage. Adverse selection → activation delay + utilization premium.
- **Centralization:** pause could censor payouts → claim path pause-exempt; upgrade
  risk → multisig + timelock + locked policy.
- **Smart-contract:** Move bug classes (visibility, type-param confusion, receipt-ID,
  rounding) → visibility sweep, generic-`T` invariants (already `EWrongPool`/
  `EWrongFeed`), Sui Prover, external audit.
- **Asset:** confirm a real Pyth **suiUSDe** feed; else ship **USDe/USD** v1.

---

## 5. What can start immediately (no funds, no approval)
Phase 0 (backtest + spec) and Phase 1 (contract v2 + tests + prover) and most of
Phase 2 (interactive UI, devInspect-verified) are all buildable now. Only Phase 3+
(mainnet deploy, real buy/claim, audit, integration) need funds/approval.

**Recommended first build:** Phase 1's oracle hardening (confidence band + dwell
trigger) — it closes the two most exploitable gaps (G1, G2), is self-contained in
`pyth_cover_pool`, fully unit-testable now, and is the credibility hinge between
"demoable" and "wouldn't get drained by a one-block wick."
