# AI Usage Disclosure — Backstop

_Sui Overflow 2026 · honest accounting of where AI is and isn't used._

## 1. AI in the product (the core)

Backstop's **AI-assisted underwriter** lives in [`agent/`](./agent). By default it runs as a
deterministic, rules-based underwriter; the Claude path is additive and optional, and has not
been exercised in any logged run (no `ANTHROPIC_API_KEY` is set). Once per cycle it reads
the live BTC oracles on DeepBook Predict, prices each market, and produces a grounded
**accept/decline decision + capacity + premium + risk rationale** per market.

What the model actually does, precisely:

- **Model:** `claude-opus-4-8` (Anthropic SDK), called from `agent/src/decide.ts`.
- **Structured output:** the decision is forced into a fixed JSON shape via
  `output_config.format = { type: "json_schema", schema: DECISION_SCHEMA }` —
  `{ accept, maxCapacityUsd, premiumBps, rationale }`. The result is parsed and tagged
  `source: "claude"`.
- **Adaptive thinking:** the call enables `thinking: { type: "adaptive" }`, so the model can
  reason before answering.
- **It reasons over numbers it does not produce.** Pricing is **on-chain**: the implied crash
  probability, bid, and premium come from DeepBook Predict's `get_trade_amounts`
  (`quoteDownPrice` in `agent/src/pricing.ts`), read via `devInspect`. The model is explicitly
  instructed (the system prompt) to ground every judgment **only** in the supplied numeric
  inputs — implied crash probability, strike vs. reference price, time to expiry, and the SVI
  volatility snapshot — and not to invent market data or use outside knowledge of BTC.

### The deterministic fallback (what runs by default)

The Claude call is **gated behind `ANTHROPIC_API_KEY`**. If no key is set — which is the
default — `getClient()` returns `null` and the agent uses a **deterministic, rules-based
underwriter** (`rulesDecision` in `decide.ts`), tagged `source: "rules"`:

- accept when implied crash prob `< 25%`, else decline (capacity 0);
- capacity scaled by `1/prob` (capped at $100k);
- premium = implied prob (bps) + 25% margin, floored at 50bps.

The same fallback also catches any failed Claude call. **So unless a key is present, Backstop
currently runs as `source: "rules"`** — fully functional with zero AI.

## 2. Verifiability — the AI's track record is auditable

Every cycle logs a complete record — the numeric **inputs + SVI snapshot + the decision +
the on-chain execution result** — to **Walrus** (`logToWalrus` in `agent/src/walrus.ts`), and
the rendered decisions are written to `app/public/agent-decisions.json` for the UI. Separately,
each probability-of-failure reading is **anchored on-chain in the `RiskFeed` Move package**,
each reading linked to its Walrus blob. Anyone can replay a decision: read the Walrus blob,
re-run `get_trade_amounts` against the same oracle, and check the on-chain supply digest. The
underwriter's history is public, not a black box.

## 3. Honest limits

- **The model is additive, never load-bearing.** The protocol works end-to-end without it via
  the rules fallback; Claude improves the rationale and judgment, it does not gate the product.
- **No model is in the settlement path.** Payouts settle on the **on-chain oracle** on DeepBook
  Predict — deterministic, trustless, sub-400ms. The AI only decides whether/how much capital
  to supply; it never decides who gets paid.
- **The model does not price risk.** Prices are on-chain reads. The model reasons over those
  numbers; it cannot fabricate or move them.

## 4. AI coding assistants during development

AI coding assistants were used while building Backstop, as is typical for a hackathon. All code
was reviewed and verified by hand: the test/verification harness in `spike/` runs against the
real Predict PTBs, and the deployed transactions are real and on-chain (see the digests in the
README and `deployment.json` — verifiable on SuiVision). Nothing here is mocked.
