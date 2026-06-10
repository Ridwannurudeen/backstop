import { Transaction } from "@mysten/sui/transactions";
import { bcs } from "@mysten/sui/bcs";
import type { SuiClient } from "@mysten/sui/client";
import {
  ACCOUNTABILITY_PKG,
  CALIBRATION_LEDGER,
  AGENT_PASSPORT,
} from "./deployment";

export type Passport = {
  name: string;
  agent: string;
  bondMist: bigint;
  decisions: number;
  createdMs: number;
};

export async function fetchPassport(
  client: SuiClient,
): Promise<Passport | null> {
  const o = await client.getObject({
    id: AGENT_PASSPORT,
    options: { showContent: true },
  });
  const f = (o.data?.content as { fields?: Record<string, string> })?.fields;
  if (!f) return null;
  return {
    name: f.name,
    agent: f.agent,
    bondMist: BigInt(f.bond),
    decisions: Number(f.decisions),
    createdMs: Number(f.created_ms),
  };
}

export type Calibration = {
  total: number;
  settled: number;
  accuracyBps: number;
  brierAvg: number;
};

// Read the four CalibrationLedger aggregates in one devInspect (4 moveCalls).
export async function fetchCalibration(
  client: SuiClient,
  sender: string,
): Promise<Calibration> {
  const tx = new Transaction();
  for (const fn of ["total", "settled", "accuracy_bps", "brier_avg"]) {
    tx.moveCall({
      target: `${ACCOUNTABILITY_PKG}::calibration::${fn}`,
      arguments: [tx.object(CALIBRATION_LEDGER)],
    });
  }
  const res = await client.devInspectTransactionBlock({
    sender,
    transactionBlock: tx,
  });
  const n = (i: number) =>
    Number(
      bcs.u64().parse(Uint8Array.from(res.results![i].returnValues![0][0])),
    );
  return { total: n(0), settled: n(1), accuracyBps: n(2), brierAvg: n(3) };
}
