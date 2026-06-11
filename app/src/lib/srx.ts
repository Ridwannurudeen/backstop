import type { SuiClient } from "@mysten/sui/client";
import { RISK_INDEX_OBJ, SRX_MARKET } from "./deployment";

export type SrxReading = {
  crashBps: number;
  volBps: number;
  tailBps: number;
  refPrice: number; // 1e9-scaled USD
  cdfBlob: string; // Walrus blob id (evidence)
  publisher: string;
  tsMs: number;
  challenged: boolean;
};

// Read the latest SRX reading for a market from the on-chain risk_index Table.
export async function fetchSrx(
  client: SuiClient,
  market = SRX_MARKET,
): Promise<SrxReading | null> {
  const idx = await client.getObject({
    id: RISK_INDEX_OBJ,
    options: { showContent: true },
  });
  const tableId = (
    idx.data?.content as {
      fields?: { readings?: { fields?: { id?: { id?: string } } } };
    }
  )?.fields?.readings?.fields?.id?.id;
  if (!tableId) return null;
  let field;
  try {
    field = await client.getDynamicFieldObject({
      parentId: tableId,
      name: { type: "0x1::string::String", value: market },
    });
  } catch {
    return null;
  }
  const f = (
    field.data?.content as {
      fields?: { value?: { fields?: Record<string, string> } };
    }
  )?.fields?.value?.fields;
  if (!f) return null;
  return {
    crashBps: Number(f.srx_crash_bps),
    volBps: Number(f.srx_vol_bps),
    tailBps: Number(f.srx_tail_bps),
    refPrice: Number(f.ref_price),
    cdfBlob: f.cdf_blob,
    publisher: f.publisher,
    tsMs: Number(f.ts_ms),
    challenged: Boolean(f.challenged),
  };
}
