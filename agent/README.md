# Backstop Agent — Pillar 2: Autonomous AI Underwriter

A self-contained Node + TypeScript service that acts as a self-driving insurance
underwriter for DeepBook **Predict** crash-protection markets on Sui testnet.

Each cycle it:

1. **Polls** the Predict testnet server for active BTC oracles + the on-chain SVI vol surface.
2. **Prices the risk** for each candidate market by `devInspect` of `predict::get_trade_amounts`
   on a DOWN binary — the per-unit price **is** the market's implied crash probability.
3. **Decides** via Claude (`claude-sonnet-4-6`), grounded only in that data, producing a
   structured underwriting decision: `{ accept, maxCapacityUsd, premiumBps, rationale }`.
4. **Logs verifiably** to Walrus testnet (content-addressed blob), recording the `blobId`.
   If Walrus is unavailable it appends to `out/decisions.jsonl` and logs `walrus pending`.
5. **Writes** the latest decisions to `out/decisions.json` for a UI to read.

It only **recommends + logs** — it does not execute on-chain supply. `executeDecision()`
is a clearly-marked stub (that needs gated DUSDC + a funded signer).

## Run

```bash
npm install
npm run once     # one cycle
npm start        # continuous loop (60s)
```

### Environment

- `ANTHROPIC_API_KEY` — optional. If set, decisions come from Claude (`decision.source = "claude"`).
  If absent, a deterministic rules engine is used (`decision.source = "rules"`):
  accept when implied crash prob < 25%, capacity scaled by 1/prob, premium = prob + 25% margin.

No funds or wallet are needed: `devInspect` runs read-only against an ephemeral address.

## Files

- `src/ids.ts` — Predict + Walrus IDs/endpoints, scales, model id (copied from the app).
- `src/pricing.ts` — Predict server fetches + `get_trade_amounts` devInspect pricing.
- `src/decide.ts` — Claude structured decision + rules fallback.
- `src/walrus.ts` — Walrus publisher log + local JSONL fallback.
- `src/index.ts` — main loop, `executeDecision()` stub, output writer.
- `out/decisions.json` — latest decisions (UI-readable).

## Verified facts

- Predict server: `https://predict-server.testnet.mystenlabs.com`
  - `GET /predicts/{PREDICT_OBJ}/oracles`, `GET /oracles/{oracleId}/svi/latest`
- Walrus testnet (verified live 2026-06-07):
  - publisher `PUT https://publisher.walrus-testnet.walrus.space/v1/blobs?epochs=N`
  - aggregator `GET https://aggregator.walrus-testnet.walrus.space/v1/blobs/{blobId}`
