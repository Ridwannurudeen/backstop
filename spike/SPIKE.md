# Backstop spike — run order

Goal: prove a DOWN-binary "crash protection" position constructs, prices, and (when funded) mints on the live DeepBook Predict BTC testnet oracle. This is the gate between "8.5 idea" and "confident 9 — verified buildable."

## 0. Install
```
cd C:\Users\gudma\backstop\spike
npm install
```

## 1. Get a testnet account
- Generate a Sui keypair (`sui client new-address ed25519`) or reuse one. Export its bech32 secret (`suiprivkey1…`).
- Fund it with testnet **SUI** (gas) at https://faucet.sui.io
- Request testnet **DUSDC** via the DeepBook Predict testnet token form (gated — do this day 1; the live mint needs it).

## 2. Set env vars (PowerShell)
```powershell
$env:SUI_PRIVATE_KEY = "suiprivkey1..."   # required
$env:STRIKE_USD = "90000"                  # optional: insure BTC < $90k
$env:QTY_USD = "5"                          # optional: $5 notional
$env:STRIKE_SCALE = "1000000000"            # optional: flip to 1000000 if step 3 aborts on strike
```

## 3. `npm run check`  — NO funds needed   ✅ RAN 2026-06-06: status success on @mysten/sui@1.45.2
devInspect-simulates `create_manager` + `market_key::down`. Proves the package is **live** and our PTB construction is valid.
- **What it proved:** package live, calls accept `(id, u64, u64)`, SDK→PTB→devInspect path works.
- **What it did NOT prove:** the correct strike scale. `market_key::down` succeeds at *any* scale (1e9, 1e6, even 1) — it just packs bytes, no range-check. The real strike validation + the mint happen in step 4 (`--live`), where `predict::mint` checks the strike against the oracle grid.

## 4. `npm run live`  — needs SUI gas + DUSDC
Creates a PredictManager (cached to `.manager`), deposits DUSDC, mints one DOWN binary. Prints the tx digest and a URL to read your position. **If this succeeds and the position settles at expiry, the idea is verified buildable — proceed with the 2-week plan.**

## What each result means
| Outcome | Verdict |
|---|---|
| check ✓ + live mint ✓ | Confident 9 path. Build it. |
| check ✓, live aborts on `mint` | Manager/qty/coin plumbing — confirm `predict.move` mint signature; fixable. |
| check aborts both scales | Contracts shifted (provisional branch) — re-pull current package ID from the repo README and update `ids.ts`. |

Open items to confirm against `predict.move` while building: exact `mint` qty semantics, the `PredictManager` struct type, and `redeem_permissionless` for the claim/settlement path.
