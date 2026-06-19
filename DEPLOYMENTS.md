# Deployments

`deployment.json` is the machine-readable source of truth. This file is the
human-readable summary.

## Sui Mainnet v4

Status: deployed, experimental, low-cap.

- `pyth_cover_pool` package:
  `0x4f8d00eb76a59996a0c88f3d103e950e6e4c02132acb8483cc8e1450005f04e9`
- Production pool:
  `0xd739a318705fb8b8401da34a3c2c3cde6397d033d72f793153ea673216eb58ed`
- `pyth_lending_demo` package:
  `0x25f89307f0e37079a8cd7be1aa10f216f1bf3d5b00c2184ea2b8bc9ffc51a670`
- Production lending market:
  `0x459b6df1dee2c3840a52b766d4c617fbabb1c5f9d08f557645080829fee9d74c`
- AdminCap custody owner:
  `0x5f21a9aaf680f6b0e0190e6a99bb9d4e314e0761ff3c3bc809f298711e73d8e5`
- Cover publish digest:
  `3TXnZXncAM3amdxAVXgP7KPH5pkfpoT9fFtpouVQbnZh`
- Lending publish digest:
  `EeNRZ5kLJqqxv2BHF1nHRYENWgDDQbeXLvBiXTE8P99A`
- Cover UpgradeCap lock digest:
  `7LJVLHs4Vb93pzS5WuwEgmwuZN9KEGBXbzx5b43kWLm9`
- Lending UpgradeCap lock digest:
  `GUm7a3fRpyQAQa92eBEEm3yVurGtfHz7vEifg7kaB4RL`
- Production AdminCap custody digest:
  `KJzWGum3aqUpH4BKxrX9DdZ5yCLp8yDvNUC28aMCZ39`
- Active cover buy digest:
  `Fk1hB7nsaYm5ZDww1sXwohHNYjcc3kmkd3qqUeFVdqwg`

The v4 pool is intentionally tiny: 0.1 SUI seeded LP capital and 0.005 SUI of
active cover. It exists to prove the corrected sale path, custody, and proof
surface without implying production-safe capacity.

## Archived Sui Mainnet v3 Proof

Status: archived mechanism-test evidence.

- `pyth_cover_pool` package:
  `0x51dd7287ac9e97147982023f5f2fa61bf5df2939d671216b19d142938f34ab05`
- Production pool:
  `0x4ab0a68e6c299353811a54b660c7e1d8cda7645a5f58c77b8593ca4bc617dc53`
- Staged mechanism-test pool:
  `0x9e188765145f3de7e246004979883ad8ab173ff0cdc61153fbd76ce5081c4e62`
- `pyth_lending_demo` package:
  `0x33cd7e03003948545527609769b77541a9c0f3f8005894d8736fdf293cbf531a`
- Staged claim digest:
  `Dm9gywopkRe9p36J21HTiLJCeRaRhdjwYaDx13WA2ekC`

The archived staged claim used intentionally permissive trigger parameters to
exercise buy -> dwell -> claim on-chain. It is not a real depeg event and is not
a v4 payout proof.

## Testnet Research

RiskFeed, SRX, DeepBook Predict, Walrus evidence, calibration, and arena
packages are research/supporting infrastructure. They are not production
settlement dependencies for the mainnet depeg pool.
