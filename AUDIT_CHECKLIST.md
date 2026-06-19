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
- LP deposits must not mint zero shares.
- Cover purchase must refund excess premium rather than accepting donations into
  pool value.
- New restricted pools must reject direct wallet buys unless `direct_sales_enabled`
  is intentionally enabled.
- `BuyerCap` purchases must only work for the pool that issued the cap.
- The collateral type argument must be consistent across pool, LP shares,
  policies, and adapter-held reserves.

## Oracle Settlement

- Price feed ID must match the pool's feed ID.
- Exponent sign and magnitude must match the pool's expected scale.
- `price + conf <= threshold` is the payout condition, not point price alone.
- Reads with confidence wider than `max_conf_bps` must reject.
- `record_breach` must reject stale Pyth data through `get_price_no_older_than`.
- `buy_cover` must also reject stale, wrong-feed, wrong-exponent, or uncertain
  Pyth data and must require the lower confidence edge to be safely above the
  sale cutoff.
- The first sub-threshold read should only arm the pool epoch.
- The confirming read must occur at least `min_dwell_secs` after arming and
  before the confirmation deadline expires.
- A healthy supplied observation must reset an open epoch.
- A recovered price after latch must not erase the claim.
- A confirmed pool-level epoch must make only policies active before epoch arm
  and unexpired at epoch confirmation claimable.
- Direct per-policy `record_breach` must not bypass pool-epoch eligibility.
- Pool recovery must advance `epoch_id` only for confirmed epochs, must reopen
  buys/deposits, and must not erase old-epoch claim rights.

## Economics

- Premium must scale by duration.
- Premium must round up so dust terms do not buy free cover.
- Premium payment must cover the required amount; any excess must be refunded.
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
- Settlement-term changes must be blocked while outstanding cover or an open
  epoch exists.
- Pause must not block `record_breach`, `claim_latched`, `expire_policy`, or
  `withdraw_lp`.
- UpgradeCaps should remain policy `DEP_ONLY` on mainnet.
- AdminCaps should remain outside the deployer wallet.

## App / SDK

- The UI must sign with `sui:mainnet` for the depeg pool.
- The 30-day UI term should use a small expiry safety margin under the on-chain
  max term.
- `quoteDepegPremium` must mirror duration pricing.
- `buildDepegBuyCoverWithPythTx`, `buildDepegRecordBreachTx`,
  `buildDepegRecordPoolBreachTx`, and `buildDepegRecordPoolRecoveryTx` must
  refresh Pyth in the same PTB before calling the Move entrypoint.
- The UI/keeper should use pool-level epochs as the primary path.
- App and SDK builders should support `coinType`, explicit premium/LP coin
  object IDs, and BuyerCap buy PTBs for stable-collateral and adapter flows.
- Proof-health must verify package existence, pool state, upgrade policy, custody,
  archived staged-claim evidence, and current production active cover from Sui
  mainnet.

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
