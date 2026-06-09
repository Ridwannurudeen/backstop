// Demonstrate the risk_guard consumer END-TO-END against the LIVE RiskFeed:
//   1. create_and_share a GuardedTreasury<SUI> bound to a real market key
//   2. deposit a little SUI, then withdraw it — withdraw reads the on-chain
//      RiskFeed and only succeeds while the market's crash probability is within
//      tolerance. A successful withdraw proves the treasury consumed the feed.
//
// Env: SUI_PRIVATE_KEY (funded), RISK_GUARD_PKG, RISK_FEED_OBJ,
//      GUARD_MARKET (e.g. "BTC<56901@1780992000000"), GUARD_TOL_BPS (e.g. 500),
//      AMOUNT_MIST (default 10000000 = 0.01 SUI).
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { NETWORK } from "./ids.js";

const SUI = "0x2::sui::SUI";

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Set ${name}`);
  return v;
}

async function main(): Promise<void> {
  const PKG = env("RISK_GUARD_PKG");
  const FEED = env("RISK_FEED_OBJ");
  const market = env("GUARD_MARKET");
  const tol = BigInt(env("GUARD_TOL_BPS"));
  const amount = BigInt(process.env.AMOUNT_MIST ?? "10000000");

  const client = new SuiClient({ url: getFullnodeUrl(NETWORK) });
  const kp = Ed25519Keypair.fromSecretKey(env("SUI_PRIVATE_KEY").trim());
  const addr = kp.getPublicKey().toSuiAddress();

  // 1) create + share the guarded treasury
  const create = new Transaction();
  create.moveCall({
    target: `${PKG}::risk_guard::create_and_share`,
    typeArguments: [SUI],
    arguments: [
      create.pure.vector("u8", Array.from(new TextEncoder().encode(market))),
      create.pure.u64(tol),
    ],
  });
  const c1 = await client.signAndExecuteTransaction({
    signer: kp,
    transaction: create,
    options: { showObjectChanges: true, showEffects: true },
  });
  console.log(`create_and_share: ${c1.effects?.status?.status} · ${c1.digest}`);
  const treasury = (c1.objectChanges ?? []).find(
    (o: any) => o.type === "created" && /GuardedTreasury/.test(o.objectType),
  ) as any;
  if (!treasury) throw new Error("treasury object not found in changes");
  console.log(`GUARDED_TREASURY=${treasury.objectId}`);
  await client.waitForTransaction({ digest: c1.digest });

  // 2) deposit a little SUI, then withdraw it — withdraw reads the live feed
  const op = new Transaction();
  const [coin] = op.splitCoins(op.gas, [op.pure.u64(amount)]);
  op.moveCall({
    target: `${PKG}::risk_guard::deposit`,
    typeArguments: [SUI],
    arguments: [op.object(treasury.objectId), coin],
  });
  const withdrawn = op.moveCall({
    target: `${PKG}::risk_guard::withdraw`,
    typeArguments: [SUI],
    arguments: [
      op.object(treasury.objectId),
      op.object(FEED),
      op.pure.u64(amount),
    ],
  });
  op.transferObjects([withdrawn], addr);
  const c2 = await client.signAndExecuteTransaction({
    signer: kp,
    transaction: op,
    options: { showEffects: true },
  });
  console.log(`deposit+withdraw: ${c2.effects?.status?.status} · ${c2.digest}`);
  if (c2.effects?.status?.status !== "success")
    console.log("abort:", c2.effects?.status?.error);
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
