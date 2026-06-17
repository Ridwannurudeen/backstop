# Backstop — Codex Handover (remaining build plan)

This is the execution handover for the **production "Risk OS for Sui"** work tracked in
`PRODUCTION_PLAN.md`. It states exactly what is **done**, what is **left**, and the
**conventions** you must follow. The authoritative roadmap is `PRODUCTION_PLAN.md`
(gap table G1–G12, phases 0–5, parameter table); this doc is the actionable cut.

Repo: `github.com/Ridwannurudeen/backstop` (private). `main` is the integration branch.
Last merged: PR #34 (`5e3cd9e`). Current branch adds `/depeg` proof health,
no-wallet PTB verification, parser fixtures, and readiness/smoke scripts.

---

## 0. Conventions (read first — these are hard rules)

- **Per-increment PR flow.** One gap/feature per branch → PR → squash-merge → next.
  Branch off `main`. **`git checkout -b <branch>` must be a SEPARATE command before
  `git commit`** — the pre-commit hook reads HEAD before the command runs and blocks a
  commit made directly on `main` even if the same line branches first.
- **No attribution.** No "Co-Authored-By", no Claude/Codex/AI mentions in code,
  commits, or PRs. Ever.
- **Verify before you build.** Read the file/signature before editing. Run the tests.
- **Secret-scanner hook** blocks writing `0x` + 64 hex literals. In Move set such
  values via `sed`/heredoc with a split var; in TS use `hexBytes()`/`"0x"+"…"` split or
  `Buffer.from(hex,"hex")`; in JSON edit via a node script. Base58 tx digests are fine.
- **Move build (Windows dev box):** the Sui CLI is `./.tools/sui.exe` (v1.73.1). Pyth +
  Wormhole ship `Move.toml` as a symlink that git-on-Windows materializes as a 17-byte
  stub → run `node contracts/pyth_cover_pool/scripts/fix-symlinked-manifests.mjs` once,
  then `./../../.tools/sui.exe move test --allow-dirty`. On Linux/macOS/CI it builds
  natively (no workaround, no `--allow-dirty` needed). There is **no CI** yet.
- **Full test command (run from the package dir):**
  `./../../.tools/sui.exe move test --allow-dirty`
- **Typecheck:** agent/sdk are TS — `cd agent && npx tsc --noEmit`; `cd sdk && npm run build`.
- **Funded Sui signing:** the depeg deploy/provision scripts can now sign from the
  local Sui keystore via `SUI_KEY_ALIAS`/`SUI_ADDRESS`; do not export or print private
  keys. A fresh mainnet alias was created locally as `backstop-mainnet-deployer`.
- **Invariants you must never break:** (1) **full collateralization** `value(funds) >=
total_cover` — no leverage on a correlated single-feed risk; (2) the **claim /
  settlement path is pause-exempt** (`record_breach`, `claim_latched`, `expire_policy`,
  `withdraw_lp` must never be gated by `paused`); (3) **`buy_cover` / `claim_latched`
  public signatures stay stable** so the SDK and `pyth_lending_demo` don't churn.
- **When you add a pool constructor param** (the recurring ripple), update ALL of:
  `new_pool`, `create_and_share`, `new_pool_for_testing` (contract);
  `agent/src/provisionPythLending.ts` `buildCreatePoolTx` opts + its call site;
  both test helpers (`contracts/pyth_cover_pool/tests/…` and
  `contracts/pyth_lending_demo/tests/…`); `readDepegPool` in `sdk/src/index.ts`
  (additive); and `contracts/pyth_cover_pool/DEPLOY.md`. Add new params at the END of
  the ctor arg list.
- **Tests size premiums via `premium_for`** (rate is utilization-dependent now — never
  hardcode a flat premium amount). See the `buy()` helper in the cover-pool tests.

---

## 1. Current state (DONE — do not redo)

Mainnet depeg product = `pyth_cover_pool` (SUI-collateralized, Pyth-settled depeg cover
on suiUSDe). Consumer = `pyth_lending_demo`. SDK surface in `sdk/src/index.ts`. The
deployed app has the wallet-connected `/depeg` mainnet action panel gated on verified
package/pool IDs; this branch adds a read-only mainnet proof-health panel for package
locks, custody, pool status, and staged/production proof txs.

**Sprint 0** (live-app defects) — done: G10 (agent never blanks the public feed), G11
(risk terminal first-liquid term), G12 (route code-splitting).

**Sprint 1 part 1** — done: no-wallet **DepegSimulator** is the lead `/depeg` surface.

**Sprint 2 contract v2 hardening** — DONE and merged:

- **G2** confidence band — adverse bound `price+conf<=threshold` + `max_conf_bps` reject.
- **G1** dwell — sustained breach: `record_breach` arms, a confirming read
  `>= min_dwell_secs` later latches; `claim_latched` pays. No single-read instant claim.
- **G3** cooldown — `activation_delay_secs`: no breach until `buy_ms + delay`;
  `buy_cover` rejects `expiry <= activation`.
- **G3** utilization premium — `premium_for` = `premium_bps + surge_premium_bps *
utilization` (post-trade `(total_cover+cover)/pool_value`, clamped to 1).
- **G6** exposure caps — `max_cover_per_policy` + `max_total_cover` (0 = uncapped).
- **G4** governance — `AdminCap` (minted to creator at `create_and_share`),
  claim-exempt `set_paused`, timelocked `propose/execute/cancel_param_update`.
- **G5** treasury fee — paid premiums are split into LP net premium + protocol
  treasury, admin-only treasury withdrawal, and timelocked `treasury_fee_bps`.
- **G8** keeper bounty — breach-confirming keepers are paid a fixed bounty from the
  treasury when funded; an empty treasury never blocks the latch.

Current `pyth_cover_pool` public API (for reference when building UI/SDK):
`new_pool`, `create_and_share` (entry), `deposit_lp`, `withdraw_lp`, `premium_rate_bps`,
`premium_for`, `buy_cover`, `expire_policy`, `record_breach`, `claim_latched`,
`withdraw_treasury`,
`set_paused`, `propose_param_update`, `execute_param_update`, `cancel_param_update`,
plus views (`pool_value`, `total_cover`, `total_shares`, `threshold`, `premium_bps`,
`surge_premium_bps`, `max_conf_bps`, `max_age_secs`, `min_dwell_secs`,
`activation_delay_secs`, `max_cover_per_policy`, `max_total_cover`, `is_paused`,
`treasury_value`, `treasury_fee_bps`, `keeper_bounty`, `timelock_secs`,
`has_pending_update`, and `policy_*` / `shares`).

`create_and_share` arg order (positional): `feed_id, expo_neg, expo_mag, threshold,
max_age_secs, premium_bps, surge_premium_bps, max_conf_bps, min_dwell_secs,
activation_delay_secs, max_cover_per_policy, max_total_cover, timelock_secs,
treasury_fee_bps, keeper_bounty, ctx`.

SDK depeg exports: `readDepegPrice`, `readDepegPool`, `quoteDepegPremium`,
`buildDepegBuyCoverTx`, `buildDepegDepositLpTx`, `buildDepegWithdrawLpTx`,
`buildDepegRecordBreachTx`, `buildDepegClaimLatchedTx`.

Tests today: `pyth_cover_pool` 34/34, `pyth_lending_demo` 4/4 (both green).

---

## 2. REMAINING WORK (ordered)

### A. Sprint 2 leftovers — contract, no funds (do these next)

#### A1 — G5 Treasury fee _(done)_

Implemented in branch `feat/pyth-treasury-fee`: `treasury_fee_bps`, `treasury`,
admin-only `withdraw_treasury`, timelocked parameter kind `9`, views, constructor
ripple, SDK pool fields, deploy docs, and 500 bps default in the provisioner.
Acceptance is green: fee skim, LP net premium, admin withdrawal, wrong cap,
post-fee collateralization, and timelocked fee update tests.

#### A2 — G8 Keeper bounty _(done)_

Implemented in branch `feat/pyth-keeper-bounty`: `keeper_bounty`, confirm-only
treasury payout to `ctx.sender()`, `record_breach`/consumer mutable-pool ripple,
timelocked parameter kind `10`, SDK pool field, deploy docs, and provisioner default
`KEEPER_BOUNTY=100000` (0.0001 SUI). Acceptance is green: confirm pays once from
treasury, empty treasury never blocks latch, and timelocked bounty updates execute.

#### A3 — Sui Prover invariant _(toolchain-blocked, documented)_

Pinned Sui CLI v1.73.1 has no `move prove` command, and no local `move-prover`,
`sui-prover`, Boogie, or Z3 executable is installed. The attempt and target
invariants are documented in `contracts/pyth_cover_pool/PROVER.md`, with a source
comment stub in `pyth_cover_pool.move`. Do not claim a formal proof until a compatible
Sui prover toolchain is available and run.

### B. Phase 0 — backtest + calibration _(done)_

Implemented in branch `feat/depeg-backtest-calibration`: `agent/src/backtestDepeg.ts`
(`npm run backtest-depeg`) replays the contract trigger (`price + conf <= threshold`,
`max_conf_bps`, dwell, activation delay) over the Oct-2025 USDe dislocation window
using Pyth Benchmarks. `DEPEG_CALIBRATION.md` records the replay outputs and calibrated
launch defaults.

Default calibrated params are now: `THRESHOLD_USD=0.985`, `MAX_CONF_BPS=200`,
`MIN_DWELL_SECS=600`, `ACTIVATION_DELAY_SECS=1800`, `premium_bps=200`,
`SURGE_PREMIUM_BPS=800`, `TREASURY_FEE_BPS=500`, `KEEPER_BOUNTY=100000`.

Acceptance is green: runnable script + short calibrated-params note.

### C. Sprint 1 part 2 / Phase 2 — interactive wallet UI on `/depeg` _(shipped; external wallet smoke remains)_

This branch adds the wallet-connected mainnet action surface:

- dapp-kit now has both `testnet` and `mainnet` provider configs; `/depeg` can switch
  the app provider to Sui mainnet.
- `app/src/components/DepegActions.tsx` persists verified package/pool IDs in
  localStorage and stays disabled until they are configured.
- **Buy cover** quotes via `quoteDepegPremium(readDepegPool(...), cover)` and builds
  `buy_cover`.
- **Provide / withdraw liquidity** builds `deposit_lp`/`withdraw_lp`; the SDK now has
  `buildDepegDepositLpTx` and `buildDepegWithdrawLpTx`.
- **Record-breach + Claim** builds Pyth-refresh `record_breach` and latched
  `claim_latched` PTBs.
- **My policies / My LP** reads owned `Policy<SUI>` and `LpShare<SUI>` objects for the
  configured pool, showing activation/armed/latched state.
- Pool state now surfaces paused/live status, collateral/cap headroom, depeg floor,
  premium curve, per-policy/pool caps, dwell/activation, oracle confidence/age,
  treasury fee, and keeper bounty. Buy/deposit are disabled when paused or over cap.
- Policy rows show activation countdown, dwell progress/readiness, latched state, and
  only enable confirm once the dwell window has elapsed.
- **Protect this position** is now a starter NAVI/Suilend rail: it scans the connected
  mainnet wallet for lending/obligation-like Sui objects, accepts a manually pasted
  position object ID, shows the object type/fields, and lets the user size the cover
  form from a manual SUI-equivalent exposure. It also dynamically loads
  `@naviprotocol/lending` and parses NAVI supply/borrow lines, including USDe-family
  net exposure in USD, reads Suilend main-pool `ObligationOwnerCap` objects directly
  without adding `@suilend/sdk`, and converts USDe-family USD exposure into a
  SUI-denominated suggested cover size with Pyth SUI/USD.
- Current `@suilend/sdk` should not be added directly to this app without a broader Sui
  SDK migration: its latest peer surface expects `@mysten/sui` v2 while the app is on
  the current dapp-kit/Sui SDK v1 stack. This branch uses a narrow direct Suilend JSON
  parser verified against live mainnet obligation shapes instead.
- No-funds live integration verification exists at the repo root as
  `npm run verify:depeg`. It verifies fixture-backed NAVI/Suilend positive exposure
  parsing, the Pyth SUI/USD helper, the exported Suilend obligation parser against a
  public mainnet USDe-family obligation, empty-owner Suilend reads, and the NAVI
  dynamic import/empty-owner path.
- `npm run verify:depeg-ptbs` dev-inspects the no-wallet depeg PTB surface against
  Sui mainnet: production deposit/buy, production withdraw target/guard, staged
  buy→record activation guard, and staged buy→claim not-breached guard.
- `npm run verify:readiness` runs app typecheck/build, agent and SDK typechecks,
  `verify:depeg`, `verify:depeg-ptbs`, `verify:custody`, and `verify:public`.
- `npm --prefix app run smoke:depeg` is a no-extension Playwright route smoke for a
  running `/depeg` URL; set `DEPEG_SMOKE_URL` to target the VPS.
- App dev tooling was upgraded to Vite 8 / `@vitejs/plugin-react` 6 to clear the
  Vite/esbuild dev advisory set. Full `npm audit` in `app` now reports 0
  vulnerabilities, not just `--omit=dev`. `app/vite.config.ts` also splits React,
  wallet/Sui, Pyth, crypto, and generic vendor chunks; the previous >500 kB build
  chunk warning is gone.

Still left:

- Run a live wallet smoke from the browser against the deployed mainnet pool.
- Validate the NAVI/Suilend exposure buttons with a connected wallet that actually has
  USDe-family positions.

### D. Sprint 3 / Phase 3 — mainnet deploy + custody _(mainnet deploy + custody complete)_

- Deployed v2 `pyth_cover_pool` + `pyth_lending_demo` to Sui mainnet via the
  keystore-backed `DEPLOY_NETWORK=mainnet` path.
- Live IDs and proof digests are recorded under `pythDepeg` in `deployment.json`.
- **G7** — package code is now locked to Sui `DEP_ONLY` on both mainnet
  `UpgradeCap`s: cover lock tx `Csrn2Vi94rnd9G1A922649UhUgpymj33rXPA58nwMTm6`,
  lending lock tx `DFCpC9cLqDmcNrBMHC4deT98HfX2QFM2337wRAqyS7n3`.
- **Admin custody** — production/staged `AdminCap`s transferred to
  `0x5f21a9aaf680f6b0e0190e6a99bb9d4e314e0761ff3c3bc809f298711e73d8e5` in tx
  `2ZxbH6RRjjn4nr12UVJ1Er2g8wi9ofVyT3suFhqMPHES`.
- `npm run verify:custody` checks both `UpgradeCap` locks and reports current
  `AdminCap` ownership. It now hard-checks against `pythDepeg.adminCustody.owner` in
  `deployment.json`.
- `ADMIN_CAP_RECIPIENT=0x... SUI_KEY_ALIAS=backstop-mainnet-deployer npm run
transfer:admin-caps` dry-runs the production + staged `AdminCap` transfer, and adding
  `-- --execute` performs it. Use only with a real multisig address.
- Seeded a staged suiUSDe pool and executed live **buy → dwell → claim** with
  `THRESHOLD_USD=1.05`, `ACTIVATION_DELAY_SECS=5`, and `MIN_DWELL_SECS=5`.
- **Acceptance left:** connected-wallet smoke against the deployed pool.

### E. Sprint 4 / Phase 4 — assurance & first integration _(partly external)_

- External audit (OtterSec/Zellic/MoveBit tier) + fix cycle; soak + bug bounty.
- Ship the 1 real integration (live policy against a real NAVI/Suilend suiUSDe
  position).
- Replayable accountability view (decision → Walrus blob → on-chain reading → outcome
  → Brier). The `/depeg` proof-health card is now in app code; external audit and first
  real integration remain outside no-wallet build scope.

### F. Phase 5 — scale _(later)_

Multi-asset pools (USDC/USDT/sUSDe), a junior backstop tranche (capital efficiency, NOT
leverage), an incentivized keeper network, progressive governance decentralization.

---

## 3. Submission / repo housekeeping (user-gated)

- Repo is **PRIVATE**; Sui Overflow requires PUBLIC at judging →
  `gh repo edit Ridwannurudeen/backstop --visibility public` (user approval first).
- Demo video + submission form are approval-gated — never submit without explicit
  user sign-off.

## 4. Known simplifications (acceptable; refine only if asked)

- Dwell = exactly **2** observations (`confirm_count` in the param table is effectively
  2, hardcoded). A configurable confirm-count is a possible future refinement.
- Utilization premium reverts toward the floor via **state** (cover freeing), not a
  Nexus wall-clock daily decay. Documented in `PRODUCTION_PLAN.md` §1.2.
- One `AdminCap` is both admin + guardian. A separate `GuardianCap` is a future split.
