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

| #   | Gap                                                                                                                                   | Evidence                                                                              | Severity                                                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | Settles on a **single instantaneous** Pyth read — a transient wick or one manipulated update pays out                                 | `do_latch`: `assert!(price_mag <= threshold)` at one moment                           | Critical — ✅ closed (dwell: two sub-threshold reads `min_dwell_secs` apart)                                                                                        |
| G2  | **Ignores the Pyth confidence interval** (`conf`)                                                                                     | `read_price_magnitude` reads only `get_price`, never `get_conf` (grep: no `conf`)     | High — ✅ closed (PR #25: adverse-bound `price+conf<=threshold` + `max_conf_bps` reject)                                                                            |
| G3  | **Flat `premium_bps`** set at pool creation; no utilization curve, no cooldown → adverse selection (buy cover at the moment of depeg) | `premium_for = cover * premium_bps / 10_000`                                          | Critical (economic) — ✅ closed (cooldown via `activation_delay_secs`; utilization curve `rate = premium_bps + surge_premium_bps * (total_cover+cover)/pool_value`) |
| G4  | **No admin / pause / governance / timelock**; `premium_bps`/`threshold`/`max_age` frozen at creation                                  | grep: no `pause`/`AdminCap`/`owner`                                                   | High — ✅ closed (`AdminCap` minted at creation; claim-exempt `set_paused`; timelocked propose/execute/cancel param updates)                                        |
| G5  | **No treasury fee** — 100% of premium to LPs, protocol not sustainable                                                                | —                                                                                     | Medium — ✅ closed (`treasury_fee_bps` premium skim + admin-only treasury withdrawal)                                                                               |
| G6  | **No exposure caps** (per-policy / per-pool) on a fully-correlated single-feed risk                                                   | —                                                                                     | High — ✅ closed (`max_cover_per_policy` + `max_total_cover` pool caps, 0 = uncapped; full collateralization kept)                                                  |
| G7  | **UpgradeCap** would sit in a hot EOA (the deployer)                                                                                  | `deployPackage.ts` transfers UpgradeCap to sender                                     | High                                                                                                                                                                |
| G8  | **No keeper incentive** to record a breach during the dip (Pyth is pull-based)                                                        | `record_breach` is permissionless but unrewarded                                      | Medium — ✅ closed (`keeper_bounty` paid from treasury on confirm)                                                                                                  |
| G9  | **No audit, no formal verification; mainnet custody still hot-keyed**                                                                 | `deployment.json` now has `pythDepeg` mainnet proof                                   | Gating                                                                                                                                                              |
| G10 | **Agent can overwrite the live public feed with `[]`** on an empty/all-failed cycle                                                   | `index.ts:162`+`:246` `persist()` writes unconditionally                              | High (live demo)                                                                                                                                                    |
| G11 | **Risk terminal defaults to soonest/0d term** → no curve on load; term options labeled by ambiguous `Nd`                              | `RiskTerminal.tsx:46` (idx 0); `predict.ts:202` soonest-first, no quoteability filter | Medium                                                                                                                                                              |
| G12 | **App bundle ~632 kB** (no route-level code splitting)                                                                                | single eager chunk in `App.tsx`                                                       | Medium                                                                                                                                                              |

(G10–G12 were surfaced by an independent Codex audit and verified against source this session.)

**The app is moving from read-only to interactive for the production product.** Verified
map: every older **interactive** flow (Buy Protection, Treasury, Cover Pool,
Underwrite, Claim) is on **testnet** and built on DeepBook **Predict**. The mainnet
depeg product now has a wallet-connected `/depeg` action panel for buy, LP,
record-breach, claim, and positions, prefilled with the verified mainnet package/pool
IDs. The SDK exposes the write-builders
(`buildDepegBuyCoverTx`, `buildDepegDepositLpTx`, `buildDepegWithdrawLpTx`,
`buildDepegRecordBreachTx`, `buildDepegClaimLatchedTx`).

---

## 1. Design decisions (verified, with rationale)

### 1.1 Oracle robustness (closes G1, G2)

- **Use the confidence band, not the point price.** For a payout require the
  _adverse_ bound below the floor: `price + conf <= threshold`. Pyth's official
  best-practice is to discount toward the adverse edge of the `price ± conf` band
  (conf ≈ 1σ). Also **reject** a read when `conf/price` exceeds a bound
  (`max_conf_bps`, e.g. 2%) — never settle while Pyth itself signals high
  uncertainty. (docs.pyth.network/price-feeds/core/best-practices; `price.move`.)
- **Sustained trigger (dwell), not a single read.** There is **no native on-chain
  TWAP on Sui** — must be built on top. Extend the latch into a dwell requirement:
  store `first_breach_ms` + a confirm count; `claim` pays only after a _second_
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
- **Exposure caps.** ✅ **Done** — pool fields `max_cover_per_policy` and
  `max_total_cover` (0 = uncapped), both enforced in `buy_cover`. **Full
  collateralization kept** — for a single-feed (fully correlated) depeg, fractional
  leverage is unsafe (every policy triggers at once); Nexus 2:1 leverage is **not**
  copied.
- **Treasury fee.** ✅ **Done** — `treasury_fee_bps` splits a protocol fee off each
  paid premium into a treasury balance for sustainability + keeper funding, while LPs
  receive the net premium and full collateralization is re-checked after the skim.
- **Keeper bounty.** ✅ **Done** — `keeper_bounty` pays the confirming keeper from the
  treasury once when a breach latches; if treasury is empty, the latch still succeeds.

### 1.3 Safety & governance (closes G4, G7)

- **AdminCap + pause** — ✅ **Done**. `AdminCap` (carries `pool_id`) is minted to the
  creator at `create_and_share`. `set_paused` gates `deposit_lp`/`buy_cover`; the
  **claim / settlement path is pause-exempt** (`record_breach`/`claim_latched`/
  `expire_policy`/`withdraw_lp` are never gated), so a guardian can never block payouts.
- **Timelocked parameter updates** — ✅ **Done**. `propose_param_update(kind, value)`
  arms a single `PendingParamUpdate` with `eta = now + timelock_secs`;
  `execute_param_update` applies it only after the ETA; `cancel_param_update` clears it.
  `kind` covers threshold, premium/surge bps, `max_age_secs`, `max_conf_bps`,
  `min_dwell_secs`, `activation_delay_secs`, and both caps — no silent live changes.
- **UpgradeCap → multisig + timelock policy** (G7) in a _separate, immutable_ package; lock
  the policy right after publish; ratchet to `Additive`/`Dependency-only` once stable.
  (docs.sui.io/build/custom-upgrade-policy.)
- **Visibility sweep** — audit every `public` fn; keep internal helpers
  `public(package)`/private (the #1 real Sui exploit class — OpenZeppelin Sui bug
  patterns). Current helpers (`read_price_magnitude`, `do_latch`, `settle`)
  are already private — keep new ones so.

### 1.4 Keeper (closes G8)

- **Keeper bounty.** ✅ **Done** — a fixed `keeper_bounty` is paid from treasury to the
  confirming caller when the dwell latches. The payout is best-effort: insufficient
  treasury skips the bounty and never blocks settlement.

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
- **"Protect this position" rail** — local branch now scans wallet-owned
  lending/obligation-like Sui objects, accepts a pasted NAVI/Suilend object ID, and
  sizes the cover form from either manual SUI-equivalent exposure or parsed lender
  exposure. It dynamically uses `@naviprotocol/lending@1.4.6` for NAVI supply/borrow
  lines, reads Suilend main-pool owner caps and obligations directly through the current
  Sui JSON-RPC client, displays USDe-family net exposure in USD, and converts lender
  USD exposure into a SUI-denominated suggested cover size with Pyth SUI/USD. Do not add
  the current `@suilend/sdk` to this app without planning the Sui SDK v2 migration; its
  peer deps do not match the app's current dapp-kit/Sui SDK v1 stack.
- **No-funds integration verifier** — `npm run verify:depeg` checks Pyth SUI/USD,
  the exported Suilend parser against a public mainnet obligation, empty-owner
  Suilend reads, and the NAVI dynamic import/empty-owner path without requiring a
  funded wallet.
- **Dev tooling hardening** — the app is on Vite 8 / `@vitejs/plugin-react` 6 so the
  full app `npm audit` is clean, including dev dependencies. The app build now splits
  React, wallet/Sui, Pyth, crypto, and generic vendor chunks, clearing the previous
  >500 kB chunk warning.
- **Mainnet deployer key** — local Sui keystore alias `backstop-mainnet-deployer` was
  created for mainnet deployment. The depeg deploy/provision scripts can sign from
  `SUI_KEY_ALIAS`/`SUI_ADDRESS`, so raw private keys do not need to be exported.

### 1.6 Asset / threshold

- v1 insures **suiUSDe/USD** — the live mainnet Pyth `PriceInfoObject`
  (`0x9b2028…d63f`, expo −8) was **verified readable this session**. Offer **USDe/USD**
  as a sibling (longer feed history, documented Oct-11-2025 depeg).
- **Calibrate the threshold to Pyth's _aggregate_ behaviour**, not the worst
  single-venue print. USDe's Oct 11 2025 dislocation was ~$0.65 on one venue but
  ~$0.94–0.97 on aggregate; a Pyth-fed trigger tracks the aggregate. Backtest the feed
  against that window before fixing `threshold`. (Flagged: confirm Pyth publishes a
  _suiUSDe_ feed vs only USDe before pinning params for the suiUSDe pool.)

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

### Phase 0 — Spec & calibration · _done_

- Backtest suiUSDe/USDe Pyth feed vs Oct 2025; pick `threshold`, `max_conf_bps`,
  `min_dwell_secs`, `activation_delay`, premium curve constants, caps. See
  `DEPEG_CALIBRATION.md`.
- Write the `pyth_cover_pool` v2 spec (state, errors, invariants) + a parameter table.
- **Acceptance:** reviewed spec + a backtest script (`agent/src/backtestDepeg.ts`)
  printing what would/wouldn't have triggered.

### Phase 1 — Contract hardening (`pyth_cover_pool` v2) · _buildable now, no funds_

Additive, behaviour-preserving where possible; new state fields + new entry funcs.

- Confidence band + `max_conf_bps` reject (G2).
- Dwell-based sustained trigger extending the latch (G1).
- Activation delay on `buy_cover` (G3).
- Utilization premium curve replacing flat `premium_bps` (G3).
- Per-policy + per-pool exposure caps (G6).
- `AdminCap` + pause (claim-exempt) + timelocked param setters (G4).
- Treasury fee split ✅ + keeper bounty ✅ (G5/G8 closed).
- Full unit tests (happy + each abort + adverse-bound + dwell + cooldown + cap +
  pause-exempt-claim) via `.tools/sui.exe move test`.
- **Sui Prover** proof of `value(funds) >= total_cover` and share accounting.
- **Acceptance:** all tests green; prover attempt documented until a compatible local
  prover toolchain is available; consumers (`pyth_lending_demo`) updated to the v2 API
  and green.

### Phase 2 — Interactive mainnet app · _buildable now; live txs need a funded wallet_

- Mainnet `SuiClient` + dapp-kit wallet wiring for the depeg product (reuse the
  testnet tabs' `ConnectButton`/`useSignAndExecuteTransaction` pattern). **Local branch
  status:** provider supports mainnet and `/depeg` can switch networks.
- Interactive flows: Buy cover, Provide/withdraw liquidity, Record-breach + Claim,
  My policies / My LP — all calling the SDK/app `buildDepeg*` builders (extended for
  v2: quote, cooldown state, dwell progress). **Local branch status:** configurable
  action panel exists and is disabled until verified package/pool IDs are entered;
  PTBs still need devInspect against a real deployed pool.
- "Protect this position" rail. **Local branch status:** wallet object discovery,
  manual object import, object type/field summary, NAVI position parsing, USDe-family
  USD exposure summary, direct Suilend main-pool obligation parsing, Pyth SUI/USD
  conversion, and cover-form sizing are wired. `npm run verify:depeg` covers the
  no-funds Pyth/NAVI/Suilend integration paths. Connected-wallet validation with real
  USDe-family positions remains open.
- **Acceptance:** every flow builds a valid PTB and signs on mainnet in a wallet
  (devInspect-verified where no funds); UI typecheck + build clean; deployed to
  backstop.gudman.xyz.

### Phase 3 — Mainnet deploy + custody · _deploy complete; admin custody open_

- Deployed v2 (`pyth_cover_pool` + updated `pyth_lending_demo`) to mainnet via the
  wired `DEPLOY_NETWORK=mainnet` path (`DEPLOY.md`).
- `UpgradeCap` policy is now locked to Sui `DEP_ONLY` for both mainnet packages:
  cover lock tx `Csrn2Vi94rnd9G1A922649UhUgpymj33rXPA58nwMTm6`, lending lock tx
  `DFCpC9cLqDmcNrBMHC4deT98HfX2QFM2337wRAqyS7n3`.
- Move `AdminCap` custody to a **real Sui multisig** once independent signer
  addresses are available.
- Seeded a staged suiUSDe pool and executed first live buy → dwell → claim with a
  threshold-above-spot demo pool, per `DEPLOY.md`.
- **Acceptance left:** admin caps wired to real multisig and connected-wallet smoke
  against the deployed pool.

### Phase 4 — Assurance & first integration · _partly external_

- External audit (OtterSec / Zellic / MoveBit tier) + fix cycle.
- Testnet/mainnet soak with the real feed + a bug bounty.
- Ship the "1 real integration" — a live policy against a real NAVI/Suilend suiUSDe
  position.
- **Acceptance:** audit report addressed; one external user/integration live;
  conservative caps in force.

### Phase 5 — Scale · _later_

- Multi-asset pools (USDC/USDT/sUSDe), junior backstop tranche for capital efficiency
  (not leverage), an incentivized keeper network, and progressive governance
  decentralization.

---

## 3. Parameters to calibrate (Phase 0 output)

| Param                              | Purpose                         | Starting point (calibrate!)                                            |
| ---------------------------------- | ------------------------------- | ---------------------------------------------------------------------- |
| `threshold`                        | depeg floor                     | $0.985 @ expo −8 (= 98_500_000); calibrated on Oct-2025 USDe aggregate |
| `max_conf_bps`                     | reject wide-band reads          | 200 bps (2%)                                                           |
| `min_dwell_secs`                   | sustained-breach window         | 600s (10 min)                                                          |
| `confirm_count`                    | breach observations required    | 2                                                                      |
| `activation_delay`                 | anti-adverse-selection cooldown | 1800s (30 min)                                                         |
| `max_age_secs`                     | settlement freshness            | 30–60 s                                                                |
| premium curve                      | utilization slope + floor       | 200 bps base + 800 bps full-utilization surge                          |
| `max_cover_per_policy`, global cap | exposure limits                 | <=20% per policy and <=80% total cover of seeded LP capital            |
| treasury fee                       | sustainability                  | 500 bps (5% of premium)                                                |
| keeper bounty                      | breach-recording incentive      | 100000 MIST provisioner default                                        |

These are launch defaults, not permanent governance constants. Re-run
`npm run backtest-depeg` as Pyth publishes more suiUSDe history or before raising caps.

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
Phase 2 (interactive UI, devInspect-verified) and the Phase 3 mainnet deploy/live
buy-claim proof are complete. Custody hardening, audit, app deploy, and the first
external integration remain.

**Recommended first build:** Phase 1's oracle hardening (confidence band + dwell
trigger) — it closes the two most exploitable gaps (G1, G2), is self-contained in
`pyth_cover_pool`, fully unit-testable now, and is the credibility hinge between
"demoable" and "wouldn't get drained by a one-block wick."
