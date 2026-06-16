# Depeg Calibration - 2026-06-16

Backtest source: `agent/src/backtestDepeg.ts`.

Data source: Pyth Benchmarks, one-minute TradingView history plus per-second price
updates for candidate breach minutes.

Window: `2025-10-10T00:00:00Z` to `2025-10-12T00:00:00Z`, covering the Oct 2025
USDe dislocation.

## Findings

The production trigger is the contract trigger:

```text
price + conf <= threshold && conf_bps <= max_conf_bps
```

Tested feed coverage:

| Feed | Result |
| --- | --- |
| `USDE/USD` | Pyth Benchmarks has the Oct 2025 dislocation window. |
| `SUIUSDE/USD` | No Pyth Benchmarks bars exist in this window. Use USDe as the historical sibling until suiUSDe has enough stress history. |

USDe replay results with `max_conf_bps=200` and `activation_delay_secs=1800`:

| Threshold | Dwell | Result |
| --- | ---: | --- |
| `$0.970` | `300s` | No payout. Worst `price + conf` was `$0.971552`. |
| `$0.972` | `300s` | No payout. Only one adverse tick qualified. |
| `$0.975` | `300s` | No payout. Adverse window was 49 seconds. |
| `$0.980` | `300s` | No payout. Adverse window was 273 seconds. |
| `$0.982` | `300s` | Already-active policy pays; buy-at-first-tick still does not pay. |
| `$0.985` | `600s` | Already-active policy pays; buy-at-first-tick still does not pay. Adverse window was 1002 seconds. |

Key observation: the visible venue dislocation was deeper than the aggregate Pyth
feed. A `$0.970` floor is too low for this historical aggregate event once confidence
is included.

## Launch Defaults

Recommended launch parameters:

| Param | Value | Rationale |
| --- | ---: | --- |
| `threshold` | `$0.985` at expo `-8` (`98_500_000`) | First tested 10-minute dwell setting that pays the Oct 2025 USDe aggregate event. |
| `max_conf_bps` | `200` | Rejects wide uncertainty while admitting the Oct 2025 qualifying window. |
| `min_dwell_secs` | `600` | Requires a sustained 10-minute aggregate depeg. |
| `activation_delay_secs` | `1800` | A policy bought at the first adverse tick does not pay this event. |
| `premium_bps` | `200` | 2% base rate before utilization surge. |
| `surge_premium_bps` | `800` | 10% total rate at full utilization. |
| `treasury_fee_bps` | `500` | 5% protocol fee, enough to seed keeper payouts without overtaxing LP premium. |
| `keeper_bounty` | `100000` MIST | Small fixed reward; settlement still succeeds if treasury is empty. |

Caps remain pool-size dependent:

```text
max_cover_per_policy <= 20% of seeded LP capital
max_total_cover <= 80% of seeded LP capital
```

Keep uncapped values only for local/demo pools.

## Commands

Default calibrated run:

```bash
cd agent
npm run backtest-depeg
```

Custom sweep:

```bash
THRESHOLD_USD=0.982 MIN_DWELL_SECS=300 npm run backtest-depeg
```
