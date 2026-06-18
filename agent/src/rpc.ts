import { getFullnodeUrl } from "@mysten/sui/client";

type SuiNetwork = "mainnet" | "testnet" | "devnet" | "localnet";

const MAINNET_RPC =
  process.env.SUI_MAINNET_RPC ?? "https://public-rpc.mainnet.sui.io:443";

export function suiRpcUrl(network: SuiNetwork): string {
  return network === "mainnet" ? MAINNET_RPC : getFullnodeUrl(network);
}
