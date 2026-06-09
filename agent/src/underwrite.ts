// Headless underwrite: supply DUSDC into the Predict shared vault and receive PLP
// (the other side of the market — earn premiums). Needs funded testnet signer.
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import {
  PREDICT_PKG,
  PREDICT_OBJ,
  DUSDC,
  CLOCK,
  QTY_SCALE,
  NETWORK,
} from "./ids.js";

const SUPPLY_USD = BigInt(process.env.SUPPLY_USD ?? "50");

function keypair(): Ed25519Keypair {
  const k = process.env.SUI_PRIVATE_KEY;
  if (!k) throw new Error("Set SUI_PRIVATE_KEY");
  return Ed25519Keypair.fromSecretKey(k.trim());
}

async function main(): Promise<void> {
  const client = new SuiClient({ url: getFullnodeUrl(NETWORK) });
  const kp = keypair();
  const addr = kp.getPublicKey().toSuiAddress();

  const { data } = await client.getCoins({ owner: addr, coinType: DUSDC });
  if (!data.length) throw new Error("no DUSDC in wallet");
  const amount = SUPPLY_USD * QTY_SCALE;

  const tx = new Transaction();
  const primary = tx.object(data[0].coinObjectId);
  if (data.length > 1)
    tx.mergeCoins(
      primary,
      data.slice(1).map((c) => tx.object(c.coinObjectId)),
    );
  const [coin] = tx.splitCoins(primary, [tx.pure.u64(amount)]);
  const plp = tx.moveCall({
    target: `${PREDICT_PKG}::predict::supply`,
    typeArguments: [DUSDC],
    arguments: [tx.object(PREDICT_OBJ), coin, tx.object(CLOCK)],
  });
  tx.transferObjects([plp], addr);

  const out = await client.signAndExecuteTransaction({
    signer: kp,
    transaction: tx,
    options: { showEffects: true, showObjectChanges: true },
  });
  console.log(
    `SUPPLY $${SUPPLY_USD} digest: ${out.digest} · status: ${out.effects?.status?.status}`,
  );
  if (out.effects?.status?.status !== "success")
    console.log("abort:", out.effects?.status?.error);
  const plpObj = (out.objectChanges ?? []).find(
    (c: any) => c.type === "created" && /PLP/.test(c.objectType),
  ) as any;
  if (plpObj)
    console.log(`received PLP: ${plpObj.objectId}  (${plpObj.objectType})`);
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
