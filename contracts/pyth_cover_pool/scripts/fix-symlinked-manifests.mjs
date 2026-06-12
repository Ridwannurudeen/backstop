#!/usr/bin/env node
// Windows-only build helper for pyth_cover_pool.
//
// Pyth and Wormhole ship their Sui `Move.toml` as a git SYMLINK to a flavored
// manifest (`Move.mainnet.toml`). On Linux/macOS the symlink materializes and
// `sui move build` resolves it natively — no workaround needed. On Windows with
// `core.symlinks=false` (the default), git writes the symlink as a tiny text
// stub containing the target filename, so the build fails:
//   TOML parse error at line 1: Move.mainnet.toml
//
// This script finds the cached Pyth + Wormhole git dependencies under ~/.move
// and replaces each stub `Move.toml` with the real manifest it points at. It is
// idempotent and a no-op on already-fixed (or non-Windows) checkouts.

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// Cached dep dirs are ~/.move/git/<sanitized-url>_<rev>; the rev suffix changes,
// so match by repo name and patch the known manifest subpath within each.
const TARGETS = [
  { match: 'pyth-crosschain', sub: 'target_chains/sui/contracts/Move.toml' },
  { match: 'wormhole', sub: 'sui/wormhole/Move.toml' },
];

const STUB = /^Move\.[\w.-]+\.toml$/; // a stub is a single line naming a sibling manifest

const gitRoot = join(homedir(), '.move', 'git');
if (!existsSync(gitRoot)) {
  console.log(`No Move git cache at ${gitRoot} — fetch deps first (run \`sui move build\` once).`);
  process.exit(0);
}

let patched = 0;
for (const dir of readdirSync(gitRoot)) {
  const repo = join(gitRoot, dir);
  if (!statSync(repo).isDirectory()) continue;
  for (const { match, sub } of TARGETS) {
    if (!dir.includes(match)) continue;
    const manifest = join(repo, sub);
    if (!existsSync(manifest)) continue;
    const content = readFileSync(manifest, 'utf8').trim();
    if (!STUB.test(content)) continue; // already a real manifest, or not a stub
    const realPath = join(repo, sub, '..', content);
    if (!existsSync(realPath)) {
      console.warn(`! ${manifest} points at ${content} but it is missing — skipped`);
      continue;
    }
    writeFileSync(manifest, readFileSync(realPath));
    console.log(`✓ patched ${dir}/${sub} (was -> ${content})`);
    patched++;
  }
}

console.log(patched
  ? `\nDone — patched ${patched} manifest(s). Now build with: sui move build --allow-dirty`
  + `\n(the patch leaves the cached dep repo "dirty", so the flag is required.)`
  : `\nNothing to patch — Pyth/Wormhole manifests already resolve (or deps not fetched yet).`);
