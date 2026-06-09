# Backstop — 5-minute demo script

Goal: win the 50% real-world axis with a *concrete, live* demo (insure → crash → instant payout → verifiable proof), narrated by the vision that makes judges sit up (*Sui's only backstop is a validator bailout — we make it a market*). Keep it **under 5:00**.

**Golden rule:** show the things that work *live, on-chain*. Lead concrete, end grand. Don't open with the abstract "risk layer" — open with someone getting paid.

---

## Record-day checklist (do these BEFORE filming)
- [ ] **Get gated DUSDC** for a testnet wallet + faucet SUI (`faucet.sui.io`). The live mint + payout money-shot needs it. *(If DUSDC truly can't be obtained in time, see "Fallback" at the end — the demo still works, minus the on-chain payout frame.)*
- [ ] Pick a **short-dated BTC oracle** (soonest expiry from the Risk terminal / agent output) so a settlement can be shown, or pre-record a settled one.
- [ ] Run the agent so the **AI underwriter tab is populated**: `cd agent && npm run once` (set `ANTHROPIC_API_KEY` if you want it to say "AI" not "rules"). To show it **acting on-chain** (supplying into the vault for each accepted market), also set `AGENT_EXECUTE=1` + `SUI_PRIVATE_KEY` (funded with DUSDC) — each decision then carries a live supply digest + PLP object in its Walrus record.
- [ ] `cd app && npm run dev`; connect the funded wallet.
- [ ] Optional: deploy `RiskFeed` (`contracts/risk_feed/DEPLOY.md`) + `npm run publish-feed` so Act 4 shows a real on-chain object.

---

## The script (shot list + spoken lines)

### 0:00–0:30 — The hook (problem)
**On screen:** headline "Sui can execute and store. It can't price or transfer risk." → the Cetus headline.
**Say:**
> "May 2025: a $223 million exploit hit Sui's biggest DEX. The backstop wasn't insurance — it was a 90.9% validator vote to roll back the chain. That's governance-by-emergency, and it doesn't scale. Less than 2% of DeFi is insured, and nothing on Sui lets you price or transfer the risk that actually wipes people out: a crash or a depeg. **Backstop is that missing layer.**"

### 0:30–1:30 — Act 1: Insure (live)
**Do:** Open **Buy protection** (or **Insure my treasury**). Pick "protect BTC below $56,000," size **$1,000**. Click **Get quote**.
**On screen:** the quote — *Premium ~$16 · Max payout $1,000.*
**Say:**
> "I want to insure $1,000 of BTC exposure against a crash below $56k. The premium — sixteen dollars — isn't set by us. It's priced live off DeepBook Predict's on-chain volatility surface: the market's own implied probability of that crash. One click."
**Do:** Click **Buy protection** → wallet signs → show the tx digest. *(Live mint — needs DUSDC.)*

### 1:30–2:30 — Act 2: Trustless settlement, both sides
**Do:** Show the policy in **My policies**, then its settled outcome (position summary: `status` + payout). Show the **Underwrite** side — the autonomous agent's real on-chain PLP position backing the market. Show the `redeem_permissionless` path (the **My policies** Claim button / the call in `app/src/lib/predict.ts`).
**On screen:** "Settled trustlessly by the oracle in <400ms. No claims adjuster. No counterparty."
**Say:**
> "Here's the honest mechanic. When the market expires, the on-chain oracle settles it trustlessly in under four hundred milliseconds — no claims process, no counterparty. If BTC is below the strike, the buyer redeems the payout instantly. This period BTC held *above* the strike — so there's no payout, and the premium flows to the underwriter: our autonomous agent's on-chain position. That's a real two-sided insurance market — buyer and underwriter, both settled on-chain — not a one-way demo. When a crash *does* breach the strike, the exact same `redeem_permissionless` call pays the buyer."
**Note (honesty):** a *guaranteed* live payout can't be staged — the Predict maker won't sell an in-the-money policy (`assert_mintable_ask`). So show the real settled position + the redeem code path; if you catch a market that settled below strike, redeem it live for the payout shot.

### 2:30–3:30 — Act 3: Proof (the moat)
**Do:** Open the **AI underwriter** tab (works with no wallet). Point at the live decisions: implied crash prob, accept/decline, capacity, premium.
**Say:**
> "Underwriting scales because it's autonomous. This agent reads the on-chain vol surface, turns it into a probability of failure, and prices capacity — every decision logged to Walrus."
**Do:** Click **"Verify on Walrus ↗"** on a decision → the raw record opens in the aggregator (inputs + the SVI snapshot).
**Say:**
> "And here's the part no off-chain insurer can match: every decision — and its real outcome — is provable on Walrus. Our risk oracle is trustless *by construction*. You can audit our entire track record."

### 3:30–4:30 — Act 4: The risk layer (vision)
**Do:** Open **Risk terminal** — the live implied-crash-probability curve from Predict. Then show the **`RiskFeed`** on-chain object (a published reading, or the contract + `ReadingPublished` event).
**Say:**
> "What you've seen isn't an insurance app — it's a risk-and-trust layer. Predict gives us the price of risk; Walrus gives us verifiable truth. We publish it on-chain as a **RiskFeed** — a probability-of-failure oracle any Sui protocol can read to back its own solvency. **That's how you replace the validator bailout with a market.** Insurance is just the first product on top — next is liquidation backstops, protocol cover, and stablecoin-depeg insurance for the RWA wave."

### 4:30–5:00 — Close
**On screen:** "Backstop — the Risk & Trust Layer for Sui. DeepBook Predict × Walrus."
**Say:**
> "Backstop. Pricing risk with DeepBook Predict, proving it with Walrus — the two primitives Sui was missing. Repo and live testnet in the description. Thanks for watching."

---

## Why this wins (map to the rubric)
- **Real-world 50%** — a real person insures real exposure on-chain; the oracle settles it trustlessly in <400ms; an autonomous agent underwrites the other side. A true two-sided market — concrete, legible, real.
- **Technical 20%** — Predict-as-risk-oracle (novel, verified-unoccupied), the compiled on-chain `RiskFeed`, AI underwriter, Walrus proof. Cross-track: DeepBook + Walrus + Agentic Web.
- **UX 20%** — one-click insure, the live terminal, the clickable Walrus proof.
- **Vision 10%** — the validator-bailout → market framing; the risk-layer roadmap.

## What is live vs. roadmap (be honest on camera if asked)
- **Live now:** quotes + risk terminal + AI underwriter + Walrus proof (all read-only, no wallet); the buy/treasury *transactions* (need DUSDC); the `RiskFeed` contract (compiled; deploy with gas). The agent **executes its own underwriting on-chain** — with `AGENT_EXECUTE=1` + a funded `SUI_PRIVATE_KEY` it supplies DUSDC into the Predict vault (`predict::supply`) for each accepted market, **sized to its recommended capacity**, and logs the digest + PLP object to Walrus (proven live, capacity-proportional: $100k-capacity market → $10.00 supplied `EcRYQ3dL…`, $36.6k → $3.6652 `AGKhzBa9…`).
- **Roadmap (say "next," don't imply it's shipped):** the mutualized capital pool / protocol cover, multi-asset + depeg markets, agent bonding. On-chain execution is gated behind `AGENT_EXECUTE`; supply is a fraction of recommended capacity (`AGENT_CAPACITY_BPS`, default 1bp, capped by `AGENT_MAX_SUPPLY_USD`) on testnet — raising it toward 100% with a funded production vault signer is next.

## Fallback if DUSDC isn't available by record day
Skip the live mint/claim. Lead Act 1 with the **live quote** ("priced off the on-chain surface, right now"), make **Act 3 (AI underwriter + Walrus proof)** and **Act 4 (risk terminal + RiskFeed)** the spine — both fully live, no wallet — and frame the mint+400ms settlement as "and when funded, this settles on-chain in 400ms" with the `predict::mint`/`redeem` path shown in code. Still a strong, *honest* demo; just lead with the read-only live pieces.
