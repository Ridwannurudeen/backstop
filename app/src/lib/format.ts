export const usd = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });

// Chain scales: quantities/DUSDC are 1e6; strikes are 1e9 (provisional — confirm at live mint).
export const fromMicro = (raw: string | bigint) =>
  Number(BigInt(raw)) / 1_000_000;
export const fromStrike = (raw: string | bigint) =>
  Number(BigInt(raw)) / 1_000_000_000;

export const shortDate = (ms: string | number) =>
  new Date(Number(ms)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

export type SuiExplorerNetwork = "testnet" | "mainnet";

export const txUrl = (
  digest: string,
  network: SuiExplorerNetwork = "testnet",
) =>
  network === "mainnet"
    ? `https://suivision.xyz/txblock/${digest}`
    : `https://testnet.suivision.xyz/txblock/${digest}`;

// SUI from mist (1e9), trimmed to at most 4 decimals.
export const sui = (mist: string | bigint | number) =>
  `${(Number(BigInt(mist)) / 1e9).toLocaleString("en-US", {
    maximumFractionDigits: 4,
  })} SUI`;
