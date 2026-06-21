// Execute one real SafePay (protected payment + cover) PTB on Sui MAINNET so the
// "live on mainnet" claim is backed by a settled transaction, not only devInspect.
// Self-addressed (recipient = payer) so the payment returns to the sender and the
// only real cost is the premium + gas. Reuses the open direct-sale pool.
//
// Run:  SUI_KEY_ALIAS=backstop-mainnet-deployer npx tsx src/safePayProof.ts
import { readFileSync } from "node:fs";
import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import {
  SuiPythClient,
  SuiPriceServiceConnection,
} from "@pythnetwork/pyth-sui-js";
import { suiRpcUrl } from "./rpc.js";
import { loadSuiKeypair } from "./suiSigner.js";

const CLOCK = "0x6";
const HERMES = "https://hermes.pyth.network";
const PYTH_STATE =
  "0x" + "1f9310238ee9298fb703c3419030b35b22bb1cc37113e3bb5007c99aec79e5b8";
const WORMHOLE_STATE =
  "0x" + "aeab97f96cf9877fee2883315d459552b2b921edc16d7ceac6eab944dd88919c";
const SUIUSDE_FEED =
  "8cead549d0e770dea8fdf5e018a85d59585265cf8bff16ba83962fc7996dbb7f";
const SUI = "0x2::sui::SUI";

async function main(): Promise<void> {
  const dep = JSON.parse(
    readFileSync(new URL("../../deployment.json", import.meta.url), "utf8"),
  );
  const op = dep.pythDepeg.openPool;
  const pkg: string = op.coverPackage;
  const pool: string = op.pool;

  const client = new SuiClient({ url: suiRpcUrl("mainnet") });
  const kp = loadSuiKeypair();
  const addr = kp.getPublicKey().toSuiAddress();

  const paymentMist = 10_000_000n; // 0.01 SUI payment (returns to self)
  const premiumMist = 2_000_000n; // generous; excess refunds
  const coverMist = 10_000_000n; // 0.01 SUI attached cover
  const expiryMs = BigInt(Date.now() + 7 * 86_400_000 - 60_000);

  const tx = new Transaction();
  const updates = await new SuiPriceServiceConnection(
    HERMES,
  ).getPriceFeedsUpdateData([SUIUSDE_FEED]);
  const pyth = new SuiPythClient(client, PYTH_STATE, WORMHOLE_STATE);
  const [pio] = await pyth.updatePriceFeeds(tx, updates, [SUIUSDE_FEED]);
  const [payment, prem] = tx.splitCoins(tx.gas, [
    tx.pure.u64(paymentMist),
    tx.pure.u64(premiumMist),
  ]);
  const [policy, refund] = tx.moveCall({
    target: `${pkg}::pyth_cover_pool::buy_cover`,
    typeArguments: [SUI],
    arguments: [
      tx.object(pool),
      prem,
      tx.pure.u64(coverMist),
      tx.pure.u64(expiryMs),
      tx.object(pio),
      tx.object(CLOCK),
    ],
  });
  tx.transferObjects([payment, policy], addr); // recipient = self
  tx.transferObjects([refund], addr);

  const out = await client.signAndExecuteTransaction({
    signer: kp,
    transaction: tx,
    options: { showEffects: true, showObjectChanges: true },
  });
  const st = out.effects?.status?.status;
  console.log(`SafePay: ${st} · ${out.digest}`);
  if (st !== "success") {
    console.log("abort:", out.effects?.status?.error);
    process.exit(1);
  }
  await client.waitForTransaction({ digest: out.digest });
  const policyObj = (out.objectChanges ?? []).find(
    (o: { type: string; objectType?: string }) =>
      o.type === "created" &&
      typeof o.objectType === "string" &&
      /::pyth_cover_pool::Policy</.test(o.objectType),
  ) as { objectId?: string } | undefined;
  console.log(`DIGEST=${out.digest}`);
  console.log(`POLICY=${policyObj?.objectId ?? "(none)"}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
