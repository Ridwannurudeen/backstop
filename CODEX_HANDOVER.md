# Backstop — Codex Handover (remaining build plan)

This is the execution handover for the **production "Risk OS for Sui"** work tracked in
`PRODUCTION_PLAN.md`. It states exactly what is **done**, what is **left**, and the
**conventions** you must follow. The authoritative roadmap is `PRODUCTION_PLAN.md`
(gap table G1–G12, phases 0–5, parameter table); this doc is the actionable cut.

Repo: `github.com/Ridwannurudeen/backstop` (private). `main` is the integration branch.
Last merged: PR #30 (`37b45ba`).

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
on suiUSDe). Consumer = `pyth_lending_demo`. SDK surface in `sdk/src/index.ts`. App
read-only `/depeg` surface (simulator + live price card) is live on
backstop.gudman.xyz.

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

Current `pyth_cover_pool` public API (for reference when building UI/SDK):
`new_pool`, `create_and_share` (entry), `deposit_lp`, `withdraw_lp`, `premium_rate_bps`,
`premium_for`, `buy_cover`, `expire_policy`, `record_breach`, `claim_latched`,
`withdraw_treasury`,
`set_paused`, `propose_param_update`, `execute_param_update`, `cancel_param_update`,
plus views (`pool_value`, `total_cover`, `total_shares`, `threshold`, `premium_bps`,
`surge_premium_bps`, `max_conf_bps`, `max_age_secs`, `min_dwell_secs`,
`activation_delay_secs`, `max_cover_per_policy`, `max_total_cover`, `is_paused`,
`treasury_value`, `treasury_fee_bps`, `timelock_secs`, `has_pending_update`, and
`policy_*` / `shares`).

`create_and_share` arg order (positional): `feed_id, expo_neg, expo_mag, threshold,
max_age_secs, premium_bps, surge_premium_bps, max_conf_bps, min_dwell_secs,
activation_delay_secs, max_cover_per_policy, max_total_cover, timelock_secs,
treasury_fee_bps, ctx`.

SDK depeg exports: `readDepegPrice`, `readDepegPool`, `quoteDepegPremium`,
`buildDepegBuyCoverTx`, `buildDepegRecordBreachTx`, `buildDepegClaimLatchedTx`.

Tests today: `pyth_cover_pool` 31/31, `pyth_lending_demo` 4/4 (both green).

---

## 2. REMAINING WORK (ordered)

### A. Sprint 2 leftovers — contract, no funds (do these next)

#### A1 — G5 Treasury fee  *(done)*
Implemented in branch `feat/pyth-treasury-fee`: `treasury_fee_bps`, `treasury`,
admin-only `withdraw_treasury`, timelocked parameter kind `9`, views, constructor
ripple, SDK pool fields, deploy docs, and 500 bps default in the provisioner.
Acceptance is green: fee skim, LP net premium, admin withdrawal, wrong cap,
post-fee collateralization, and timelocked fee update tests.

#### A2 — G8 Keeper bounty  *(touches `record_breach` signature)*
Reward whoever posts the Pyth update + arms/confirms the dwell (Pyth is pull-based).
- Add pool field `keeper_bounty: u64` (coin units), paid from `treasury` (preferred) to
  `ctx.sender()` **once**, on the CONFIRM transition (when `breached` flips true).
- This requires `record_breach` to take `&mut DepegCoverPool` + `ctx` (currently `&` +
  no ctx). **Ripple to handle:** the SDK `buildDepegRecordBreachTx` moveCall args are
  unchanged (the pool object is already passed; `&`→`&mut` is transparent to the PTB,
  but `ctx` is implicit so no new arg) — verify; `pyth_lending_demo::record_shortfall`
  must pass `&mut pool` + `ctx` and so must its callers/tests; `do_latch` likewise.
- Guard: pay only if `treasury` has funds (else pay 0 / skip — never abort the latch).
  Keep it a fixed bounty; gas-rebate sizing is a Phase-5 refinement.
- Ctor gains `keeper_bounty` (ripple). Timelockable (optional).
- **Acceptance:** test that a confirm pays the keeper exactly once from treasury and
  the latch still works when treasury is empty. All suites green.

#### A3 — Sui Prover invariant  *(assurance, optional but in Phase-1 acceptance)*
Prove `value(funds) >= total_cover` and share accounting with **Sui Prover**. If the
toolchain isn't available, document the attempt and leave a `#[spec]`/comment stub —
do not fake it.

### B. Phase 0 — backtest + calibration *(no funds; was skipped, acceptance-listed)*
- Write `agent/src/backtestDepeg.ts` (`npm run backtest-depeg`): pull suiUSDe/USDe Pyth
  history (Hermes), replay the v2 trigger (conf band + dwell + activation) over the
  Oct-2025 USDe dislocation window, print what would/wouldn't have paid.
- Use the output to fix `threshold`, `max_conf_bps`, `min_dwell_secs`,
  `activation_delay_secs`, premium curve constants, caps, treasury fee (see
  `PRODUCTION_PLAN.md` §3 table — current values are **templates, not tuned**).
- **Acceptance:** runnable script + a short calibrated-params note.

### C. Sprint 1 part 2 / Phase 2 — interactive wallet UI on `/depeg` *(no funds; live txs need a funded wallet, devInspect otherwise)*
Make `/depeg` a wallet-connected mainnet dApp (today it is read-only). Reuse the
testnet tabs' dapp-kit pattern (`ConnectButton`, `useSignAndExecuteTransaction`).
- **Buy cover** — quote via `quoteDepegPremium(readDepegPool(...), cover)`; build with
  `buildDepegBuyCoverTx`; show activation delay + dwell terms.
- **Provide / withdraw liquidity** — `deposit_lp`/`withdraw_lp` (add SDK builders;
  show TVL, utilization, premium APR, full-collateralization headroom).
- **Record-breach + Claim** — `buildDepegRecordBreachTx` (arm → wait dwell → confirm)
  then `buildDepegClaimLatchedTx`; show **dwell progress** (`policy_first_breach_ms` +
  `min_dwell_secs`) and **activation** state.
- **My policies / My LP** — live positions + claimable/pending state; surface `paused`.
- **"Protect this position" widget** — read a real NAVI/Suilend suiUSDe position via
  `navi-sdk` and size a policy to it (the unilateral path to "1 real integration").
- **Acceptance:** every flow builds a valid PTB (devInspect-verified with no funds);
  app `tsc` + `vite build` clean; deploy via `bash deploy/deploy.sh` (see gotchas in
  `deploy/DEPLOY.md` — kill any lingering `vite preview` on :4173 before `npm ci`;
  never blanket-kill `node.exe`).

### D. Sprint 3 / Phase 3 — mainnet deploy + custody *(FUNDS/APPROVAL-GATED — do not run without the user)*
- Deploy v2 `pyth_cover_pool` + `pyth_lending_demo` to mainnet via the wired
  `DEPLOY_NETWORK=mainnet` path (`contracts/pyth_cover_pool/DEPLOY.md`). Needs a funded
  **mainnet** wallet (the existing throwaway key is testnet-only) + ~0.5 SUI.
- **G7** — move `UpgradeCap` + `AdminCap` to a **Sui multisig**; publish a timelock
  upgrade-policy package in a *separate, immutable* package; lock the policy; ratchet to
  Additive/Dependency-only once stable (docs.sui.io/build/custom-upgrade-policy).
- Seed a real suiUSDe pool; first live **buy → dwell → claim** (stageable immediately
  with `THRESHOLD_USD=1.05` + small `ACTIVATION_DELAY_SECS`/`MIN_DWELL_SECS`, per
  `DEPLOY.md`).
- **Acceptance:** live pkg ids + one real buy/claim digest in `deployment.json`; caps
  on multisig.

### E. Sprint 4 / Phase 4 — assurance & first integration *(partly external)*
- External audit (OtterSec/Zellic/MoveBit tier) + fix cycle; soak + bug bounty.
- Ship the 1 real integration (live policy against a real NAVI/Suilend suiUSDe
  position).
- Proof-health badges + replayable accountability (decision → Walrus blob → on-chain
  reading → outcome → Brier).

### F. Phase 5 — scale *(later)*
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
