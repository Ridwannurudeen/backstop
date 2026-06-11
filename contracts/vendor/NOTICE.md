# Vendored DeepBook Predict packages

These three Move packages — `predict` (`deepbook_predict`), `deepbook`, `token` —
are **vendored upstream source** from MystenLabs, copied from
[`MystenLabs/deepbookv3`](https://github.com/MystenLabs/deepbookv3) @ branch
`tlee/predict-workshop`. They are unmodified except for each `Move.toml`, where we
pin `published-at` + `[addresses]` to the **live Sui testnet** package ids so that
`oracle_pool`'s published bytecode links against the deployed DeepBook packages and
reads `deepbook_predict::oracle::OracleSVI` trustlessly on-chain.

Pinned testnet ids:
- `deepbook_predict` — `0xf5ea2b37…5c785138`
- `deepbook` — published-at `0x74cd5657…df6cc77c8`, address `0xfb28c4cb…cbec6982`
- `token` (DEEP) — `0x36dbef86…7e0a58a8`

They are vendored (rather than a git dependency) because the upstream repo uses a
git-based dependency resolver that is unreliable here, and vendoring makes the
build reproducible. We do not deploy these packages — they are already live; we
only compile against them. See `contracts/oracle_pool/` for the consumer.
