# Backstop — Execution Playbook

**The risk & trust layer for Sui.** Crash insurance priced by DeepBook Predict, proven on Walrus.
Live (testnet): **https://backstop.gudman.xyz** · Repo: `github.com/Ridwannurudeen/backstop`

> First command every time: `npm run verify:public` — confirms the judge-facing demo is intact
> (site, on-chain RiskFeed, key tx digests, Walrus proof blobs, executed supply rows).

---

## 1. The demo spine (what a judge sees, in order)

```
 DeepBook Predict      AI underwriter         Walrus              RiskFeed (Move)        RiskGuard (Move)        Predict vault
┌──────────────────┐  ┌────────────────┐  ┌──────────────┐  ┌────────────────────┐  ┌────────────────────┐  ┌────────────────┐
│ get_trade_amounts│  │ accept/decline │  │ tamper-evident│  │ probability_bps()  │  │ GuardedTreasury    │  │ mint / supply  │
│  = implied       │─▶│  + capacity    │─▶│  decision     │─▶│  on-chain          │─▶│  withdraw FREEZES  │─▶│  real on-chain │
│  P(crash)        │  │  (Claude/rules)│  │  memory       │  │  prob-of-failure   │  │  when risk > tol   │  │  tx + digest   │
└──────────────────┘  └────────────────┘  └──────────────┘  └────────────────────┘  └────────────────────┘  └────────────────┘
      quote               decision            proof ↗           on-chain oracle        consumer reacts          money moves

  Trust = a public CALIBRATION LEDGER: predictions vs. realized outcomes over time (not "Walrus = truth").
```

---

## 2. Phase roadmap

```
  [x] Phase 0  Proof .......................... DONE — live testnet, all 4 primitives, proofs fresh
  [x] Phase 1  Risk Oracle (read-only) ........ DONE — RiskFeed + RiskGuard consumer LIVE on-chain
  [~] Phase 2  Backstop pool (capital lane) .... CoverPool LIVE on testnet (parametric deposit→buy→claim);
                                                 stablecoin depeg insurance still mainnet-gated (BTC-only oracles)
  [ ] Phase 3  Backstop network (liq backstops). mainnet-gated
  [ ] Phase 4  Provenance & trust standard ..... future
  [ ] Phase 5  Agent accountability + cross-chain future (agent bonds, reputation passports, Ika)
```

The capital lane (parametric CoverPool) is now built + proven on testnet. What remains mainnet-gated is
specifically *depeg* insurance (testnet Predict has BTC-only oracles) and real production capital.

---

## 3. Status snapshot

```
LIVE & PROVEN ON TESTNET                          REMAINING TO SUBMIT (non-code, yours)
  [x] insurance mint (predict::mint)                [ ] record demo video (DEMO.md is the script)
  [x] AI underwriter executes predict::supply       [ ] flip repo public (command in section 4G)
  [x] on-chain RiskFeed + fresh readings            [ ] submit form (needs your approval)
  [x] RiskGuard consumer (withdraw reads feed)
  [x] CoverPool: parametric crash payout on-chain  OPTIONAL POLISH
  [x] live risk terminal (read-only, no wallet)      [x] in-UI guided demo-spine walkthrough
  [x] app deployed at backstop.gudman.xyz            [ ] set ANTHROPIC_API_KEY -> AI tab shows "claude"
  [x] README / DECK / SUBMISSION / AI_USAGE
  [x] verify:public (17/17), 8 move tests
```

---

## 4. Runbook — copy-paste blocks

All paths are relative to the repo root (`C:\Users\gudma\backstop`). The funded testnet key lives in
`spike/.localkey` (gitignored). Full object IDs are in `deployment.json` — substitute where shown.

### A. Confirm the demo is intact (run this first, and right before submitting)
```bash
npm run verify:public
```

### B. Run the app locally
```bash
cd app && npm install && npm run dev      # http://localhost:5173
```

### C. Refresh Walrus proofs + on-chain readings  -- DO THIS BEFORE FINAL SUBMISSION
Walrus testnet blobs expire; re-anchor fresh ones (30-epoch retention) and republish the feed.
```bash
cd agent
# 1) fresh decisions + executed on-chain supply + long-retention Walrus blobs
export SUI_PRIVATE_KEY=$(cat ../spike/.localkey)
AGENT_EXECUTE=1 WALRUS_EPOCHS=30 npm run once
# 2) anchor fresh readings on-chain (IDs from deployment.json: riskFeed.package/.feedObject/.publisherCap)
RISK_FEED_PKG=<riskFeed.package> RISK_FEED_OBJ=<riskFeed.feedObject> PUBLISHER_CAP=<riskFeed.publisherCap> npm run publish-feed
cd .. && npm run verify:public            # must be all-green before submitting
```
> No-key, no-spend version (UI populates, runs as `source:"rules"`, no executed rows): `cd agent && npm run once`

### D. Redeploy the app to backstop.gudman.xyz
```bash
bash deploy/deploy.sh                      # build -> ship dist -> nginx reload (SSH may be flaky; retry)
```

### E. Tests / contracts
```bash
cd contracts/risk_guard && ../../.tools/sui.exe move test     # 2/2 - consumer circuit breaker
cd app && npm run build                                       # typecheck + production build
```

### F. Demo the RiskGuard consumer live (treasury freezes on crash risk)
```bash
cd agent
export SUI_PRIVATE_KEY=$(cat ../spike/.localkey)
RISK_GUARD_PKG=<riskGuard.package> RISK_FEED_OBJ=<riskFeed.feedObject> \
  GUARD_MARKET="BTC<56901@1780992000000" GUARD_TOL_BPS=500 npx tsx src/demoGuard.ts
```

### F2. Demo the CoverPool live (deposit → buy → crash → on-chain payout)
```bash
cd agent
export SUI_PRIVATE_KEY=$(cat ../spike/.localkey)
COVER_POOL_PKG=<coverPool.package> RISK_FEED_PKG=<riskFeed.package> \
  RISK_FEED_OBJ=<riskFeed.feedObject> PUBLISHER_CAP=<riskFeed.publisherCap> \
  npx tsx src/demoCoverPool.ts
# Move tests: cd ../contracts/cover_pool && ../../.tools/sui.exe move test   # 6/6
```

### G. Submission steps (when ready — get explicit approval before the form)
```bash
gh repo edit Ridwannurudeen/backstop --visibility public      # Sui Overflow requires a public repo
# then: record video (see DEMO.md) -> fill submission form
```

---

## 5. Key references
- `deployment.json` — canonical package/object IDs + tx digests (mint, supply, RiskFeed, RiskGuard).
- `DEMO.md` — 5-min demo script (honest two-sided framing).
- `DECK.md` / `SUBMISSION.md` — pitch deck + submission summary.
- `ROADMAP.md` — the 6-phase vision; `AI_USAGE.md` — how Claude is used (additive, not load-bearing).
- `scripts/verify-public.mjs` — what `npm run verify:public` runs.
