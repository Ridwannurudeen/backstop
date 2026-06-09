#!/usr/bin/env bash
# Repeatable content deploy for Backstop (static SPA) to the shared Contabo VPS.
# Builds app/dist locally and ships it to /opt/backstop/web, then reloads nginx.
# One-time setup (DNS, nginx conf, TLS cert) is in DEPLOY.md — run that first.
set -euo pipefail

VPS="${BACKSTOP_VPS:-root@75.119.153.252}"
WEBROOT=/opt/backstop/web
HERE="$(cd "$(dirname "$0")" && pwd)"

echo "==> building app"
cd "$HERE/../app"
npm ci
npm run build

echo "==> packing dist"
tar -czf /tmp/backstop-dist.tgz -C dist .

echo "==> shipping to $VPS:$WEBROOT"
scp /tmp/backstop-dist.tgz "$VPS:/tmp/backstop-dist.tgz"
ssh "$VPS" "set -e; \
  mkdir -p $WEBROOT; \
  rm -rf ${WEBROOT:?}/*; \
  tar -xzf /tmp/backstop-dist.tgz -C $WEBROOT; \
  rm -f /tmp/backstop-dist.tgz; \
  nginx -t && systemctl reload nginx; \
  echo DEPLOYED"

rm -f /tmp/backstop-dist.tgz
echo "==> done: https://backstop.gudman.xyz"
