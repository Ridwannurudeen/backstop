# SRX — the Sui Risk Index family

**The first on-chain, options-implied probability distribution for crypto, extracted trustlessly from DeepBook Predict and published as a public benchmark.**

Crypto's "fear indexes" today are numbers a website computes off a centralized exchange's data. SRX is different: it is the market's *entire risk-neutral distribution* — read from a live on-chain options market (DeepBook Predict), anchored with reproducible evidence on Walrus, published on-chain by bonded oracles, and slashable when wrong. Anyone — a contract, a treasury, a dashboard — reads it in one call.

This document is the methodology. Every number SRX publishes is reproducible from public on-chain data by following the steps below.

---

## 1. The source of truth: binary prices are probabilities

DeepBook Predict quotes **DOWN binaries**: a position on market `(oracle, expiry T, strike K)` that pays `1` unit if the underlying settles at or below `K` at expiry, else `0`.

The price of that binary **is** the market's risk-neutral probability of the event. For a digital put,

```
price_DOWN(K)  =  e^(−rT) · P^Q(S_T ≤ K)  ≈  P^Q(S_T ≤ K)
```

We drop discounting (`r ≈ 0`, short horizons, testnet) — documented, not hidden. We read `price_DOWN(K)` as the **per-unit premium** returned by the public `get_trade_amounts` call on the Predict package (ask × qty / qty), the same read the live Risk Terminal already uses (verified 2026-06-07: `$5` cover → premium reads as price-per-unit). These reads are done **off-chain via `devInspect`** because Predict's on-chain binary pricer (`binary_price_pair`, `compute_price`) is `public(package)` — not callable cross-package. The derivation is therefore off-chain but **fully reproducible**: the input snapshot (oracle id, strike grid, raw quotes, timestamp) is anchored to Walrus, and bonded publishers are slashable if their published index diverges from a re-derivation.

---

## 2. The risk-neutral CDF

For one oracle (fixed expiry `T`) we sample DOWN prices across a strike grid `K_1 < K_2 < … < K_n` spanning roughly `0.5·S_ref … 1.0·S_ref`, where `S_ref` is the oracle's reference (spot/forward) price.

```
F(K_i)  =  price_DOWN(K_i)  =  P^Q(S_T ≤ K_i)        the risk-neutral CDF
```

`F` is non-decreasing in `K` (a higher barrier is more likely to be breached). We clamp to `[0,1]` and enforce monotonicity (isotonic clamp) to absorb microstructure noise from the internal market maker's quotes. The **density** follows directly — no Breeden–Litzenberger second derivative needed, because binaries give the CDF itself:

```
f(K_i)  ≈  ( F(K_{i+1}) − F(K_i) ) / ( K_{i+1} − K_i )
```

This `{(K_i, F_i)}` grid is the complete object SRX publishes. The three headline indices are functionals of it.

---

## 3. The indices

All three are computed per oracle (per horizon `T`) and reported in basis points, with the horizon labeled. Where a fixed horizon is useful (e.g. "30-day"), we interpolate across the available oracle expiries.

### SRX-CRASH — the fear number
Probability of a ≥20% drawdown over the horizon:

```
SRX-CRASH  =  F(0.8 · S_ref)          (linear-interpolated between grid strikes)
```

Reported in bps (e.g. `1376` = 13.76%). This is the single number a treasury watches. It is `P^Q(S_T ≤ 0.8 S_ref)` — read straight off the curve.

### SRX-VOL — model-free implied volatility
Annualized volatility of log-returns implied by the risk-neutral density, computed directly from `f` (a density-moment estimator — the binary analogue of the VIX strike integral, more direct because we hold the density):

```
μ      =  Σ_i  ln(K_i / S_ref) · f(K_i) · ΔK_i
Var    =  Σ_i ( ln(K_i / S_ref) − μ )² · f(K_i) · ΔK_i
SRX-VOL =  sqrt( Var / T )            annualized, T in years
```

This is "model-free" in the VIX sense: it makes no Black–Scholes assumption; it integrates the observed risk-neutral distribution. (The classic VIX `σ² = (2/T)∫ Q(K)/K² dK` is the vanilla-option form of the same quantity; with binaries we evaluate the density moments directly.) Tail mass outside the sampled grid is a documented truncation; we extend the lowest/highest strike flat and report the covered probability mass alongside the value.

### SRX-TAIL — expected shortfall
The average loss conditional on landing in the worst 5% of outcomes — what a hedger actually fears:

```
q05      =  F^(-1)(0.05)                          strike at the 5th percentile
SRX-TAIL =  (1/0.05) · Σ_{K_i ≤ q05} (S_ref − K_i) · f(K_i) · ΔK_i
```

Reported as a percentage of `S_ref`. Unlike a single VaR threshold, expected shortfall captures the *shape* of the tail — the information binaries are uniquely good at revealing.

---

## 4. On-chain publication & the bonded-oracle model

Each epoch, a bonded publisher writes a snapshot to the `risk_index` Move object (shared, readable by any contract):

```
IndexReading {
  underlying, horizon_ms, ref_price,
  srx_crash_bps, srx_vol_bps, srx_tail_bps,
  cdf_blob,            // Walrus blob: the full {strike, prob} grid + raw quotes
  ts_ms, publisher
}
```

`cdf_blob` is the **evidence**: the exact inputs, so anyone can re-run §2–§3 and confirm the published indices. Publishers bond SUI through an `AgentPassport` (the accountability layer); a `slash_for_divergence` path lets anyone prove a published index disagrees with a re-derivation from the anchored inputs beyond tolerance, and slash the bond. Trust is therefore **cryptoeconomic, not assumed** — the defining difference from a website-computed fear index.

Consumers read indices in one call: `risk_index::srx_crash(feed, market): u64`, etc. — the same composition pattern `risk_guard` and `cover_pool` already use against `RiskFeed`.

---

## 5. Honest limitations

- **Risk-neutral ≠ real-world measure.** SRX is the market's *priced* probability, which embeds a risk premium. This is the correct, standard quantity for pricing cover and reading market fear — but it is not a physical forecast. Stated plainly.
- **Discretization.** A finite strike grid; indices are interpolated and the covered probability mass is reported with each value.
- **No discounting.** `r ≈ 0` assumed (short horizon, testnet). Trivial to add a discount factor on mainnet.
- **Testnet is BTC-only.** Predict exposes BTC oracles on testnet, so SRX is BTC today; the methodology is asset-agnostic and extends the moment Predict lists more underlyings.
- **IMM-quoted.** Early-market prices come partly from Predict's internal market maker; SRX inherits its quote quality and improves as real flow arrives. The bonded-publisher slashing is what keeps published values honest in the meantime.

---

## 6. Reproduce any SRX value (verification recipe)

1. Read the published `IndexReading` and its `cdf_blob` from Walrus.
2. Independently `devInspect get_trade_amounts` across the same strike grid on the same oracle.
3. Rebuild `F`, `f`, and recompute SRX-CRASH/VOL/TAIL per §2–§3.
4. Confirm they match the on-chain values within tolerance — or call `slash_for_divergence` and take the publisher's bond.

That is the whole point: **a fear index you can audit, and profit from auditing.**
