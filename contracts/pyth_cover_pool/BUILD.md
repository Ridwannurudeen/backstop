# Building `pyth_cover_pool`

This package settles claims against **Pyth Network** on Sui mainnet, so it depends
on the Pyth and Wormhole Sui Move packages (pinned to their mainnet branches in
`Move.toml`).

## Linux / macOS / CI

```bash
sui move test     # or: sui move build
```

Nothing special — the Pyth/Wormhole git dependencies resolve and link natively.

## Windows

Pyth and Wormhole ship their Sui `Move.toml` as a **git symlink** to a flavored
manifest (`Move.toml -> Move.mainnet.toml`). With git's default `core.symlinks=false`
on Windows, the symlink is checked out as a 17-byte text stub, and the build fails:

```
TOML parse error at line 1, column 18
1 | Move.mainnet.toml
```

Fix it once per dependency fetch, then build with `--allow-dirty`:

```bash
sui move build                         # fetches the deps (will error on the stub)
node scripts/fix-symlinked-manifests.mjs   # rewrites the stub Move.toml from its target
sui move test --allow-dirty            # the patch makes the cached dep "dirty" -> flag required
```

`fix-symlinked-manifests.mjs` locates the cached Pyth/Wormhole deps under
`~/.move/git` and replaces each stub `Move.toml` with the manifest it points at.
It is idempotent and a no-op once patched. Re-run it only after the dependency
cache is re-fetched (e.g. the pinned `rev` changes).

## Note: Pyth Sui upgrade (2026-07-31)

The Pyth Sui mainnet package is upgraded by the DAO on 2026-07-31. Shared object IDs
(Pyth State, each PriceInfoObject) stay stable; the package id changes. If building
after that date, re-pin the `Pyth` dependency `rev` in `Move.toml` and rebuild.
