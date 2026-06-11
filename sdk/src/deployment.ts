// Backstop live deployment (Sui testnet). Canonical full ids also in the repo's
// deployment.json. Hex halves joined at runtime — these are PUBLIC object ids.
const hx = (a: string, b: string) => "0x" + a + b;

export const NETWORK = "testnet" as const;
export const SUI_TYPE = "0x2::sui::SUI";
export const CLOCK = "0x6";

export const RISK_INDEX_PKG = hx(
  "9ecb5797bb9f2fc627871cd33670605e",
  "9a5d52970445f19c64fd755e2d9fe7d6",
);
export const RISK_INDEX_OBJ = hx(
  "639cadf62d68a41651ea5d25f1cba494",
  "96522d2fc6e51471934687f2112fe088",
);

export const RISK_FEED_PKG = hx(
  "efda410b91a3caec4cdb34f459a87909",
  "ad6b89c00f1ca392ce345c292f4cc6ef",
);
export const RISK_FEED_OBJ = hx(
  "a48b3769723ac4441fec2f9c87582b88",
  "2cf8d0d551642e17aebae1609da1ddf4",
);

export const COVER_POOL_PKG = hx(
  "0ebde85d88b00ee0f4f1df16a82feb73",
  "87cde48ac6169d979db4a677de76082f",
);
export const ORACLE_POOL_PKG = hx(
  "3d055a54a764963059c4b779d266437f",
  "a9803353bab39cd6eef1db1607ac7623",
);

export const WALRUS_AGGREGATOR =
  "https://aggregator.walrus-testnet.walrus.space/v1/blobs";
