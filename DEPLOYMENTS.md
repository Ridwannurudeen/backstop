# Deployments

`deployment.json` is the machine-readable source of truth. This file is the
human-readable summary.

## Sui Mainnet v5

Status: deployed, experimental, low-cap.

- `pyth_cover_pool` package:
  `0x49a4385606094ec78faa8b445372e8dd515dd0ddb513730a8ba9c4b734d5827c`
- Production pool:
  `0x55fe8bb8730c68931bbbcf876b7007d190febb04e2b82cccac7057868e83d8b1`
- `pyth_lending_demo` package:
  `0xdbddf4df28aea4489f7979cc608bea4a599a6643f79bfe10cecca1cc06aabaa8`
- Production lending market:
  `0xda46848a368d5ea6c48f776fc233479c30ac807a1b1a2d5c0b59de11b3bac0c0`
- AdminCap custody owner:
  `0x5f21a9aaf680f6b0e0190e6a99bb9d4e314e0761ff3c3bc809f298711e73d8e5`
- Cover publish digest:
  `5dhPHdNwfevSjH2wdchbukRvqD64ZxCEed6eHPFYMCv`
- Lending publish digest:
  `7W1J3C5hPxpfxoQ1dZ1rSkr2FDxR4ygsefeRkJi9JZrx`
- Cover UpgradeCap lock digest:
  `FhJxJrZFoQmePPcnMiJ2C5TXKFzSaub27GRh934PyK23`
- Lending UpgradeCap lock digest:
  `FhJxJrZFoQmePPcnMiJ2C5TXKFzSaub27GRh934PyK23`
- Production AdminCap custody digest:
  `FA6QsTgABa8mCvcmZWpAnUFBJRKoG9zuXuFkhUqjFsrZ`
- Active cover buy digest:
  `GfEGXtLsJvdRCHakV7dNpq3BHvKuxBJV68tenEtcsNDR`

The v5 pool is intentionally tiny: 0.02 SUI seeded LP capital and 0.001 SUI of
adapter-held active cover. Direct wallet sales are disabled; the pool-scoped
`BuyerCap` is installed into the reference lending market. It exists to prove
the restricted adapter path, custody, and proof surface without implying
production-safe capacity.

## Archived Sui Mainnet v4

Status: archived low-cap deployment, superseded by v5.

- `pyth_cover_pool` package:
  `0x4f8d00eb76a59996a0c88f3d103e950e6e4c02132acb8483cc8e1450005f04e9`
- Production pool:
  `0xd739a318705fb8b8401da34a3c2c3cde6397d033d72f793153ea673216eb58ed`
- `pyth_lending_demo` package:
  `0x25f89307f0e37079a8cd7be1aa10f216f1bf3d5b00c2184ea2b8bc9ffc51a670`
- Active cover buy digest:
  `Fk1hB7nsaYm5ZDww1sXwohHNYjcc3kmkd3qqUeFVdqwg`

The v4 pool proved the corrected sale path, custody, and proof surface. It is no
longer the default production pool.

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
a v5 payout proof.

## Testnet Research

RiskFeed, SRX, DeepBook Predict, Walrus evidence, calibration, and arena
packages are research/supporting infrastructure. They are not production
settlement dependencies for the mainnet depeg pool.
