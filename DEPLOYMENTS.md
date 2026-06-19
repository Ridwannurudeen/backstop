# Deployments

`deployment.json` is the machine-readable source of truth. This file is the
human-readable summary.

## Sui Mainnet v3

Status: deployed, experimental, low-cap.

- `pyth_cover_pool` package:
  `0x51dd7287ac9e97147982023f5f2fa61bf5df2939d671216b19d142938f34ab05`
- Production pool:
  `0x4ab0a68e6c299353811a54b660c7e1d8cda7645a5f58c77b8593ca4bc617dc53`
- Staged mechanism-test pool:
  `0x9e188765145f3de7e246004979883ad8ab173ff0cdc61153fbd76ce5081c4e62`
- `pyth_lending_demo` package:
  `0x33cd7e03003948545527609769b77541a9c0f3f8005894d8736fdf293cbf531a`
- Production lending market:
  `0x27d3f2753ab05170d0484a70114191f4fcdb35275db9b2ad9895db18cc92e712`
- Staged lending market:
  `0x41067a88643fc6339b70166120624b7de8393c8bf395c30be81fafc4fd787182`
- AdminCap custody owner:
  `0x5f21a9aaf680f6b0e0190e6a99bb9d4e314e0761ff3c3bc809f298711e73d8e5`
- Cover publish digest:
  `CWBs2fUpv7kJcmYKC76nJXeB6sT5zobxzy6EABm4AGrq`
- Lending publish digest:
  `Hj1efy7v8QD7C42ZjCrtx2xc4V5ikjqcJSieqdvJgn4D`

## v4 Source

Status: source-complete in this branch, not deployed.

The v4 source hardens sale gating, epoch settlement, exact premium handling,
zero-share deposits, keeper bounty behavior, and mutable settlement terms. Do
not claim these protections are live until a new package and pool are published
and this file plus `deployment.json` are updated.

## Testnet Research

RiskFeed, SRX, DeepBook Predict, Walrus evidence, calibration, and arena
packages are research/supporting infrastructure. They are not production
settlement dependencies for the mainnet depeg pool.
