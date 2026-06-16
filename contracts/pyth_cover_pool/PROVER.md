# Pyth Cover Pool Prover Notes

Status: toolchain-blocked on this Windows dev box.

## Attempt

Pinned Sui CLI:

```text
sui 1.73.1-ff1fe0ec4551-dirty
```

Checked commands:

```text
.tools/sui.exe move --help
```

The installed CLI exposes `build`, `test`, `coverage`, `summary`, `format`,
`migrate`, `new`, and dependency commands, but no `move prove` command.

Checked for standalone prover dependencies:

```text
Get-Command move-prover,sui-prover,boogie,z3
```

No local prover, Boogie, or Z3 executable is installed.

## Target Invariants

When a compatible Sui Move prover toolchain is available, encode these properties
for `DepegCoverPool<T>`:

1. Full collateralization:
   `balance::value(&pool.funds) >= pool.total_cover`.
2. Treasury isolation:
   `balance::value(&pool.treasury)` must never be counted as policy collateral.
3. Liability accounting:
   `total_cover` only increases on `buy_cover` and decreases on `claim_latched`
   or `expire_policy`.
4. LP withdrawal safety:
   `withdraw_lp` cannot leave `funds < total_cover`.

## Current Runtime Enforcement

The full-collateralization invariant is guarded in code at every value-changing
path that can affect liabilities:

- `buy_cover` joins only the net premium into `funds`, then asserts
  `balance::value(&pool.funds) >= pool.total_cover + cover` before increasing
  `total_cover`.
- `withdraw_lp` computes the LP payout, then asserts `value - payout >= total_cover`
  before taking funds.
- `claim_latched`/`settle` decreases `total_cover` before taking the policy payout.
- `expire_policy` decreases `total_cover` without moving funds.
- Keeper bounty payouts are taken only from `treasury`, never from `funds`.

Regression coverage currently exercises the collateralization and treasury paths
in `contracts/pyth_cover_pool/tests/pyth_cover_pool_tests.move`.
