# Deploying Backstop

Backstop's frontend is a **static Vite/React SPA** — nginx serves the built files
directly. No Node server, systemd unit, or port (unlike the Next.js apps on the box).
Target: `https://backstop.gudman.xyz` on the shared Contabo VPS `root@75.119.153.252`.

Files:
- `backstop.gudman.xyz.conf` — nginx port-80 base (certbot adds the TLS block).
- `deploy.sh` — repeatable content deploy (build → ship `app/dist` → reload nginx).

---

## Prerequisite — DNS (one-time, USER)

`backstop.gudman.xyz` does **not** resolve yet (no wildcard on `gudman.xyz`; every
subdomain has its own A record). At the DNS provider for `gudman.xyz`, add:

```
Type: A    Name: backstop    Value: 75.119.153.252    TTL: default
```

Verify before continuing (must return `75.119.153.252`):

```bash
nslookup backstop.gudman.xyz 8.8.8.8
```

TLS issuance fails until this resolves.

---

## One-time setup (VPS)

Run from this repo root after DNS resolves.

The committed `backstop.gudman.xyz.conf` has both a port-80 (redirect + ACME) block
and a 443 (TLS) block. The 443 block references the cert, which doesn't exist until
certbot runs — so issue the cert **before** enabling the full conf.

```bash
VPS=root@75.119.153.252

# 1. Web root + first content ship (builds locally, copies app/dist → /opt/backstop/web)
ssh $VPS 'mkdir -p /opt/backstop/web'
bash deploy/deploy.sh

# 2. Install the site with the 443 block temporarily removed, so nginx -t passes
#    without a cert and the port-80 ACME location goes live.
sed '/listen 443/,$d' deploy/backstop.gudman.xyz.conf | ssh $VPS 'cat > /etc/nginx/sites-available/backstop.gudman.xyz.conf'
ssh $VPS 'ln -sf /etc/nginx/sites-available/backstop.gudman.xyz.conf /etc/nginx/sites-enabled/ && nginx -t && systemctl reload nginx'

# 3. Issue the cert via WEBROOT.  This box presets authenticator=webroot in
#    /etc/letsencrypt/cli.ini — do NOT use `--nginx` (it errors "Too many flags
#    setting authenticators 'webroot' -> 'nginx'").
ssh $VPS 'certbot certonly --webroot -w /var/www/html -d backstop.gudman.xyz --non-interactive --agree-tos -m nraheemst@gmail.com'

# 4. Install the full conf (port 80 redirect + 443 TLS) and reload.
scp deploy/backstop.gudman.xyz.conf $VPS:/etc/nginx/sites-available/backstop.gudman.xyz.conf
ssh $VPS 'nginx -t && systemctl reload nginx'
```

Auto-renew is already scheduled on the box (shared certbot timer) — no extra step.
Note: this box's nginx predates the standalone `http2 on;` directive — the conf omits
HTTP/2 to keep `nginx -t` clean. Always check `nginx -t`'s own exit code before reload
(don't pipe it through `tail`, which masks the failure).

---

## Verify

```bash
curl -I  https://backstop.gudman.xyz                 # 200, served by nginx
curl -Is http://backstop.gudman.xyz | head -1        # 301 -> https
curl -s  https://backstop.gudman.xyz/agent-decisions.json | head -c 120
```

Then open `https://backstop.gudman.xyz` — the **Risk terminal** and **AI underwriter**
tabs render with no wallet; the AI underwriter rows show the live on-chain supply links.

---

## Redeploy (content updates)

Any time the app or the baked-in agent decisions change:

```bash
bash deploy/deploy.sh
```

### Refreshing the AI-underwriter feed

`agent-decisions.json` is baked into the build from `app/public/`. To publish a fresh
run (e.g. Claude-tagged decisions, or new on-chain executions) before deploying:

```bash
cd agent
# optional: ANTHROPIC_API_KEY=… for AI-tagged decisions
# optional: AGENT_EXECUTE=1 SUI_PRIVATE_KEY=… to execute + log new supplies
npm run once          # rewrites app/public/agent-decisions.json
cd .. && bash deploy/deploy.sh
```

---

## Notes (shared-host hygiene)

- This deploy is **additive** — a new web root, a new nginx site, a new cert. It does
  not touch the other live apps (bequest/kickoff/reef/verdikt/…) on the box.
- The only box-wide action is `systemctl reload nginx` (graceful; existing connections
  unaffected). Always `nginx -t` first (the commands above do).
- Static serving adds no long-running process — negligible footprint on the hot box.
