import { SuiClient } from "@mysten/sui/client";
import { suiRpcUrl } from "./rpc.js";
import { loadSuiKeypair } from "./suiSigner.js";

const MIN_DEPLOY_BALANCE_MIST = BigInt(
  process.env.MIN_DEPLOY_BALANCE_MIST ?? "500000000",
);

const sui = (mist: bigint) => (Number(mist) / 1_000_000_000).toFixed(4);

async function main(): Promise<void> {
  const kp = loadSuiKeypair();
  const address = kp.getPublicKey().toSuiAddress();
  const client = new SuiClient({ url: suiRpcUrl("mainnet") });
  const balance = await client.getBalance({ owner: address });
  const total = BigInt(balance.totalBalance);
  console.log(`address: ${address}`);
  console.log(`balance: ${sui(total)} SUI`);
  console.log(`minimum: ${sui(MIN_DEPLOY_BALANCE_MIST)} SUI`);
  if (total < MIN_DEPLOY_BALANCE_MIST) {
    throw new Error("deployer needs more SUI before mainnet deploy");
  }
  console.log("ok deployer is funded for mainnet deploy");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
