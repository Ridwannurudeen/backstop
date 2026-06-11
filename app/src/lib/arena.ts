import type { SuiClient } from "@mysten/sui/client";
import { ARENA_OBJ } from "./deployment";

export type AgentRow = {
  address: string;
  name: string;
  accuracyBps: number;
  wins: number;
  quotes: number;
  bondMist: bigint;
  slashedMist: bigint;
};

// Read the arena leaderboard: the roster + each agent's scorecard.
export async function fetchArena(client: SuiClient): Promise<AgentRow[]> {
  const arena = await client.getObject({
    id: ARENA_OBJ,
    options: { showContent: true },
  });
  const fields = (
    arena.data?.content as {
      fields?: {
        roster?: string[];
        agents?: { fields?: { id?: { id?: string } } };
      };
    }
  )?.fields;
  const roster = fields?.roster ?? [];
  const agentsTable = fields?.agents?.fields?.id?.id;
  if (!agentsTable || roster.length === 0) return [];

  const rows: AgentRow[] = [];
  for (const address of roster) {
    let stat;
    try {
      stat = await client.getDynamicFieldObject({
        parentId: agentsTable,
        name: { type: "address", value: address },
      });
    } catch {
      continue;
    }
    const f = (
      stat.data?.content as {
        fields?: { value?: { fields?: Record<string, string> } };
      }
    )?.fields?.value?.fields;
    if (!f) continue;
    const quotes = Number(f.quotes);
    const hits = Number(f.hits);
    rows.push({
      address,
      name: f.name,
      accuracyBps: quotes > 0 ? Math.floor((hits * 10_000) / quotes) : 0,
      wins: Number(f.wins),
      quotes,
      bondMist: BigInt(f.bond),
      slashedMist: BigInt(f.slashed),
    });
  }
  // Best-calibrated first.
  return rows.sort((a, b) => b.accuracyBps - a.accuracyBps);
}
