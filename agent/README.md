# Backstop Agent - Research Underwriter

A self-contained Node + TypeScript service that acts as a research underwriter
for DeepBook Predict crash-protection markets on Sui testnet.

This is not the production depeg keeper. The current production app is the
mainnet Pyth-settled suiUSDe depeg cover desk.

Each cycle it:

1. Polls the Predict testnet server for active BTC oracles and the on-chain SVI
   vol surface.
2. Prices the risk for each candidate market by `devInspect` of
   `predict::get_trade_amounts` on a DOWN binary.
3. Decides via Claude when `ANTHROPIC_API_KEY` is set, or a deterministic rules
   fallback when it is not.
4. Logs decisions to Walrus testnet when available, or to `out/decisions.jsonl`
   as a local fallback.
5. Writes latest decisions to `out/decisions.json` for the UI research lane.

It recommends and logs. Do not present this service as the production depeg
keeper unless it is explicitly wired to signed mainnet breach, claim, or expiry
transactions.

## Run

```bash
npm install
npm run once
npm start
```

## Environment

- `ANTHROPIC_API_KEY`: optional. If set, decisions come from Claude.
- No funds or wallet are needed for the read-only research cycle.

## Files

- `src/ids.ts`: Predict and Walrus IDs/endpoints, scales, model id.
- `src/pricing.ts`: Predict server fetches and `get_trade_amounts` devInspect
  pricing.
- `src/decide.ts`: Claude structured decision and rules fallback.
- `src/walrus.ts`: Walrus publisher log and local JSONL fallback.
- `src/index.ts`: main loop and output writer.
- `out/decisions.json`: latest UI-readable decisions.

## Verified facts

- Predict server: `https://predict-server.testnet.mystenlabs.com`
- Walrus testnet publisher:
  `https://publisher.walrus-testnet.walrus.space/v1/blobs?epochs=N`
- Walrus testnet aggregator:
  `https://aggregator.walrus-testnet.walrus.space/v1/blobs/{blobId}`
