// Backstop live deployments. Canonical full ids also live in the repo's
// deployment.json. Hex halves joined at runtime; these are PUBLIC object ids.
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

// --- Depeg cover (Sui MAINNET, settled by Pyth) ---
// The rest of the SDK reads Backstop's testnet risk layer; depeg cover settles on
// mainnet Pyth, so its reads need a mainnet SuiClient. Pyth State/Wormhole State +
// the suiUSDe PriceInfoObject verified live 2026-06-12 (stable shared objects).
export const MAINNET = "mainnet" as const;
export const HERMES = "https://hermes.pyth.network";

export const PYTH_DEPEG_COVER_PKG = hx(
  "3ec312b1173922dfe6d5866741299f45",
  "25c135fa90709a39ddb0a0f7e8baccb5",
);
export const PYTH_DEPEG_POOL = hx(
  "1d9d15da40239822d4201e713ae92d5f",
  "ec415f9771e4711be30fc7e76886c523",
);
export const PYTH_LENDING_PKG = hx(
  "729e11856afe3d1f7678366b7fbcbe8a",
  "f0aecb623cc0277f372a5b95fa6a3b2e",
);
export const PYTH_LENDING_MARKET = hx(
  "f36d1a0f00e1777e0c4ce3b4355d531f",
  "15d06b4d0aa6a87160fe4a18e575b209",
);

export const PYTH_STATE = hx(
  "1f9310238ee9298fb703c3419030b35b",
  "22bb1cc37113e3bb5007c99aec79e5b8",
);
export const WORMHOLE_STATE = hx(
  "aeab97f96cf9877fee2883315d459552",
  "b2b921edc16d7ceac6eab944dd88919c",
);

// suiUSDe/USD — the flagship depeg feed (Ethena-backed, live across Sui DeFi).
// Feed id is chain-agnostic; PriceInfoObject is its on-chain object on Sui mainnet.
export const SUIUSDE_FEED_ID =
  "8cead549d0e770dea8fdf5e018a85d59585265cf8bff16ba83962fc7996dbb7f";
export const SUIUSDE_PRICE_OBJECT = hx(
  "9b2028bfc829127d2e5ead1691dc3002",
  "de9e9b8d8076b4915e5ecc7d9b99d63f",
);
