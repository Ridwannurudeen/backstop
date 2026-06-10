import type { SuiClient } from "@mysten/sui/client";
import { REGISTERED_EVENT } from "./deployment";

export type RegisteredPool = {
  market: string;
  poolId: string;
  triggerBps: number;
};

// The on-chain directory of cover pools, read from PoolRegistered events
// (latest entry per market).
export async function fetchRegisteredPools(
  client: SuiClient,
): Promise<RegisteredPool[]> {
  const r = await client.queryEvents({
    query: { MoveEventType: REGISTERED_EVENT },
    limit: 50,
    order: "descending",
  });
  const seen = new Set<string>();
  const out: RegisteredPool[] = [];
  for (const e of r.data) {
    const j = e.parsedJson as {
      market: string;
      pool_id: string;
      trigger_bps: string;
    };
    if (seen.has(j.market)) continue;
    seen.add(j.market);
    out.push({
      market: j.market,
      poolId: j.pool_id,
      triggerBps: Number(j.trigger_bps),
    });
  }
  return out;
}
