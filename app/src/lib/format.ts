export const usd = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });

// Chain scales: quantities/DUSDC are 1e6; strikes are 1e9.
export const fromMicro = (raw: string | bigint) =>
  Number(BigInt(raw)) / 1_000_000;
export const fromStrike = (raw: string | bigint) =>
  Number(BigInt(raw)) / 1_000_000_000;

export const shortDate = (ms: string | number) =>
  new Date(Number(ms)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

type SuiNetwork = "testnet" | "mainnet";

export const txUrl = (digest: string, network: SuiNetwork = "testnet") =>
  network === "mainnet"
    ? `https://suivision.xyz/txblock/${digest}`
    : `https://testnet.suivision.xyz/txblock/${digest}`;

export const objectUrl = (id: string, network: SuiNetwork = "testnet") =>
  network === "mainnet"
    ? `https://suivision.xyz/object/${id}`
    : `https://testnet.suivision.xyz/object/${id}`;
