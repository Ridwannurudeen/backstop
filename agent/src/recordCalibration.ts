// Feed the on-chain CalibrationLedger from the agent's own decisions: record each
// underwriting decision's implied probability of failure as a prediction. Later,
// settle_prediction (see provisionWiden.ts / contracts) resolves it vs the realized
// outcome, so the agent's accuracy accrues on-chain. Mirrors publishRiskFeed.ts.
//
// Env: SUI_PRIVATE_KEY (funded, holds the calibration AdminCap). Reads IDs from
// deployment.json and the agent's out/decisions.json.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { NETWORK, CLOCK } from "./ids.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const d = JSON.parse(
  readFileSync(join(HERE, "..", "..", "deployment.json"), "utf8"),
);

type Decision = {
  input: {
    symbol: string;
    strikeUsd: number;
    expiryMs: string;
    impliedCrashProb: number;
  };
  walrusBlobId: string | null;
};

async function main(): Promise<void> {
  const k = process.env.SUI_PRIVATE_KEY;
  if (!k)
    throw new Error("Set SUI_PRIVATE_KEY (holds the calibration AdminCap)");
  const ACC = d.accountability;

  const file = JSON.parse(
    readFileSync(join(HERE, "..", "out", "decisions.json"), "utf8"),
  ) as { decisions: Decision[] };
  const decisions = file.decisions ?? [];
  if (!decisions.length)
    throw new Error(
      "no decisions in out/decisions.json — run `npm run once` first.",
    );

  const client = new SuiClient({ url: getFullnodeUrl(NETWORK) });
  const kp = Ed25519Keypair.fromSecretKey(k.trim());

  const tx = new Transaction();
  for (const dec of decisions) {
    const market = `${dec.input.symbol}<${dec.input.strikeUsd}@${dec.input.expiryMs}`;
    const probBps = Math.min(
      10000,
      Math.max(0, Math.round(dec.input.impliedCrashProb * 10000)),
    );
    tx.moveCall({
      target: `${ACC.package}::calibration::record_prediction`,
      arguments: [
        tx.object(ACC.calibrationLedger),
        tx.object(ACC.adminCap),
        tx.pure.string(market),
        tx.pure.u64(probBps),
        tx.pure.string(dec.walrusBlobId ?? ""),
        tx.object(CLOCK),
      ],
    });
  }
  const out = await client.signAndExecuteTransaction({
    signer: kp,
    transaction: tx,
    options: { showEffects: true },
  });
  console.log(
    `recorded ${decisions.length} prediction(s) -> ${out.digest} (${out.effects?.status?.status})`,
  );
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
