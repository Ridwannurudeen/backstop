#!/usr/bin/env bash
# Build and publish the keeper snapshot, then upload it to the VPS web root API.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_DIR="$REPO_ROOT/app"

# Optional overrides:
# BACKSTOP_KEEPER_OUT        output path (local) for the keeper snapshot
# BACKSTOP_KEEPER_TARGET     scp destination
# BACKSTOP_KEEPER_PUBLISH     set to 0 to skip publish and only upload existing output

KEEPER_OUT="${BACKSTOP_KEEPER_OUT:-$APP_DIR/public/api/keeper-operations.json}"
KEEPER_TARGET="${BACKSTOP_KEEPER_TARGET:-root@75.119.153.252:/opt/backstop/web/api/keeper-operations.json}"
PUBLISH="${BACKSTOP_KEEPER_PUBLISH:-1}"

if [[ "$PUBLISH" == "1" ]]; then
  cd "$APP_DIR"
  npm install
  BACKSTOP_DEPEG_KEEPER_OUT="$KEEPER_OUT" npm run keeper:depeg:publish
fi

if [[ ! -f "$KEEPER_OUT" ]]; then
  echo "keeper snapshot not found: $KEEPER_OUT" >&2
  exit 1
fi

if [[ "$KEEPER_TARGET" == *:* ]]; then
  scp "$KEEPER_OUT" "$KEEPER_TARGET"
else
  targetDir="$(dirname "$KEEPER_TARGET")"
  mkdir -p "$targetDir"
  cp "$KEEPER_OUT" "$KEEPER_TARGET"
  chmod 755 "$targetDir"
fi
chmod a+r "$KEEPER_OUT"
chmod a+r "$KEEPER_TARGET"
echo "uploaded $(wc -c < "$KEEPER_OUT") bytes -> $KEEPER_TARGET"
