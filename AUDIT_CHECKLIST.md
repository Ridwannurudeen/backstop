# Backstop Audit Checklist

Scope this checklist to the production path first:

- `contracts/pyth_cover_pool`
- `contracts/pyth_lending_demo`
- app/SDK transaction builders for the mainnet depeg flow
- deployment metadata and custody evidence in `deployment.json`

## Contract Invariants

- `funds >= total_cover` must hold after every deposit, buy, withdraw, expiry,
  and claim path.
- Claims must be pause-exempt.
- A policy cannot pay unless it was latched by the dwell rule.
- A latched policy cannot be expired out from under the holder.
- A policy made claimable by a confirmed pool-level epoch cannot be expired out
  from under the holder.
- Expiry cleanup must release pool-side liability exactly once.
- Permissionless `expire_policy_by_id` must not let a caller release live or
  breached policies.
- LP shares must be pro-rata and must not withdraw collateral that backs active
  cover.
- Treasury withdrawal must not touch LP funds or policy collateral.
- Keeper bounty must be best-effort and must not block settlement.

## Oracle Settlement

- Price feed ID must match the pool's feed ID.
- Exponent sign and magnitude must match the pool's expected scale.
- `price + conf <= threshold` is the payout condition, not point price alone.
- Reads with confidence wider than `max_conf_bps` must reject.
- `record_breach` must reject stale Pyth data through `get_price_no_older_than`.
- The first sub-threshold read should only arm the policy.
- The confirming read must occur at least `min_dwell_secs` after arming.
- A recovered price after latch must not erase the claim.
- A confirmed pool-level epoch must make only policies active before epoch arm
  and unexpired at epoch confirmation claimable.
- Pool recovery must advance `epoch_id` only for confirmed epochs, must reopen
  buys/deposits, and must not erase old-epoch claim rights.

## Economics

- Premium must scale by duration for v2 pools.
- Premium must round up so dust terms do not buy free cover.
- Selected expiry must be greater than activation time.
- Selected term must not exceed `max_policy_duration_secs`.
- Per-policy and aggregate exposure caps must be enforced.
- Full collateralization must remain true after treasury fee skim.
- SUI payout for USD depeg cover creates basis risk; product copy must disclose
  it.

## Governance And Custody

- `AdminCap` must govern only its pool.
- Parameter changes must pass bounds checks.
- Timelock must be enforced before execution.
- Pause must not block `record_breach`, `claim_latched`, `expire_policy`, or
  `withdraw_lp`.
- UpgradeCaps should remain policy `DEP_ONLY` on mainnet.
- AdminCaps should remain outside the deployer wallet.

## App / SDK

- The UI must sign with `sui:mainnet` for the depeg pool.
- The 30-day UI term should use a small expiry safety margin under the on-chain
  max term.
- `quoteDepegPremium` must mirror v2 duration pricing.
- `buildDepegRecordBreachTx` must refresh Pyth in the same PTB before calling
  `record_breach`.
- v3 `buildDepegRecordPoolBreachTx` and `buildDepegRecordPoolRecoveryTx` must
  refresh Pyth in the same PTB before calling the pool-level entrypoints.
- The UI/keeper must distinguish v2 per-policy pools from v3 epoch-enabled pools
  and avoid presenting v3 semantics as live on v2.
- Proof-health must verify package existence, pool state, upgrade policy, custody,
  staged claim, and production active cover from Sui mainnet.

## Verification Commands

```bash
npm run verify:readiness
```

Move suites:

```powershell
..\\..\\.tools\\sui.exe move test --allow-dirty
```

Use `--allow-dirty` only for the Pyth packages when the local cached Pyth
dependency is dirty; do not use it to ignore project-source changes.
