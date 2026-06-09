import Anthropic from "@anthropic-ai/sdk";
import { CLAUDE_MODEL } from "./ids.js";

export type UnderwritingInput = {
  symbol: string;
  oracleId: string;
  expiryMs: string;
  strikeUsd: number;
  referencePriceUsd: number | null;
  impliedCrashProb: number; // DOWN-binary price, 0..1
  bidUsd: number;
  premiumUsd: number;
  sizeUsd: number;
  svi: unknown | null;
};

export type Decision = {
  accept: boolean;
  maxCapacityUsd: number;
  premiumBps: number;
  rationale: string;
  source: "claude" | "rules";
};

const DECISION_SCHEMA = {
  type: "object",
  properties: {
    accept: { type: "boolean" },
    maxCapacityUsd: { type: "number" },
    premiumBps: { type: "number" },
    rationale: { type: "string" },
  },
  required: ["accept", "maxCapacityUsd", "premiumBps", "rationale"],
  additionalProperties: false,
} as const;

const SYSTEM = `You are an autonomous insurance underwriter for an on-chain crash-protection vault on Sui.
A "policy" is a DOWN binary on a BTC oracle: it pays out if BTC settles below the strike at expiry.
Underwriting = supplying capital that backs these payouts in exchange for premium.

You decide whether the vault should accept exposure to a market, how much capacity to allocate,
and what premium to charge. Ground EVERY judgment ONLY in the numeric inputs provided — the
implied crash probability (the live DOWN-binary price), the strike vs reference price, the time to
expiry, and the SVI volatility snapshot. Do not invent market data or use outside knowledge of BTC.

Guidance:
- impliedCrashProb is the market's own estimate of the payout probability. Higher = riskier to underwrite.
- premiumBps must compensate for that risk: at minimum cover impliedCrashProb (in bps) plus a margin.
- maxCapacityUsd should shrink as impliedCrashProb rises (concentrate less capital in likely-payout markets).
- Decline (accept=false, capacity 0) when the risk is unpriceable or the implied probability is extreme.
Respond with the decision only.`;

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic();
  return client;
}

function rulesDecision(input: UnderwritingInput): Decision {
  const p = Math.min(Math.max(input.impliedCrashProb, 0), 1);
  const accept = p < 0.25;
  // Capacity scaled by 1/prob, capped; declined markets get 0.
  const base = 100_000;
  const maxCapacityUsd = accept
    ? Math.round(Math.min(base, base * (0.05 / Math.max(p, 0.01))))
    : 0;
  // Premium = implied prob (in bps) + 25% margin, floored at 50bps.
  const premiumBps = Math.max(50, Math.round(p * 10_000 * 1.25));
  return {
    accept,
    maxCapacityUsd,
    premiumBps,
    rationale: accept
      ? `Rules: implied crash prob ${(p * 100).toFixed(2)}% < 25% threshold; capacity scaled by 1/prob, premium = prob+25% margin.`
      : `Rules: implied crash prob ${(p * 100).toFixed(2)}% >= 25% threshold; declined.`,
    source: "rules",
  };
}

function parseDecision(text: string): Omit<Decision, "source"> {
  let raw = text.trim();
  // Defensive: strip code fences and extract the first JSON object if wrapped in prose.
  raw = raw
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start !== -1 && end !== -1) raw = raw.slice(start, end + 1);
  const o = JSON.parse(raw) as Record<string, unknown>;
  if (
    typeof o.accept !== "boolean" ||
    typeof o.maxCapacityUsd !== "number" ||
    typeof o.premiumBps !== "number" ||
    typeof o.rationale !== "string"
  ) {
    throw new Error("decision JSON missing/invalid fields");
  }
  return {
    accept: o.accept,
    maxCapacityUsd: o.maxCapacityUsd,
    premiumBps: o.premiumBps,
    rationale: o.rationale,
  };
}

export async function decide(input: UnderwritingInput): Promise<Decision> {
  const c = getClient();
  if (!c) return rulesDecision(input);
  try {
    const res = await c.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 8192,
      system: SYSTEM,
      thinking: { type: "adaptive" },
      output_config: {
        format: { type: "json_schema", schema: DECISION_SCHEMA },
      },
      messages: [
        {
          role: "user",
          content: `Underwrite this market. Inputs:\n${JSON.stringify(input, null, 2)}`,
        },
      ],
    });
    const text = res.content.find((b) => b.type === "text")?.text ?? "";
    return { ...parseDecision(text), source: "claude" };
  } catch (err) {
    console.warn(
      `  [decide] Claude call failed (${(err as Error).message}); falling back to rules.`,
    );
    return rulesDecision(input);
  }
}
