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

export const txUrl = (digest: string) =>
  `https://testnet.suivision.xyz/txblock/${digest}`;
