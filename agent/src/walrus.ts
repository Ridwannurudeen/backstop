import { appendFile } from "node:fs/promises";
import { WALRUS_PUBLISHER } from "./ids.js";

export type WalrusResult =
  | { ok: true; blobId: string }
  | { ok: false; reason: string };

// Append a decision record to Walrus (verifiable, content-addressed log).
// Verified live 2026-06-07: PUT {publisher}/v1/blobs?epochs=N returns a JSON
// envelope with .blobId, readable back via {aggregator}/v1/blobs/{blobId}.
export async function logToWalrus(
  record: unknown,
  epochs = 30,
): Promise<WalrusResult> {
  try {
    const r = await fetch(`${WALRUS_PUBLISHER}?epochs=${epochs}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(record),
      signal: AbortSignal.timeout(90_000),
    });
    if (!r.ok) return { ok: false, reason: `publisher HTTP ${r.status}` };
    const body = (await r.json()) as any;
    const blobId =
      body?.newlyCreated?.blobObject?.blobId ??
      body?.alreadyCertified?.blobId ??
      null;
    if (!blobId)
      return { ok: false, reason: "no blobId in publisher response" };
    return { ok: true, blobId };
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
}

// Fallback sink when Walrus is unavailable: append one JSON line locally.
export async function logToLocal(path: string, record: unknown): Promise<void> {
  await appendFile(path, JSON.stringify(record) + "\n", "utf8");
}
