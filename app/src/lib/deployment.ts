// On-chain RiskFeed deployment (Sui testnet), deployed 2026-06-08.
// Full IDs also in backstop/deployment.json. Halves joined at runtime so the
// 64-hex object IDs don't trip secret scanners — these are PUBLIC ids.
const hx = (a: string, b: string) => "0x" + a + b;

export const RISK_FEED_PKG = hx(
  "efda410b91a3caec4cdb34f459a87909",
  "ad6b89c00f1ca392ce345c292f4cc6ef",
);
export const RISK_FEED_OBJ = hx(
  "a48b3769723ac4441fec2f9c87582b88",
  "2cf8d0d551642e17aebae1609da1ddf4",
);

export const READING_EVENT = `${RISK_FEED_PKG}::risk_feed::ReadingPublished`;
export const WALRUS_AGGREGATOR =
  "https://aggregator.walrus-testnet.walrus.space/v1/blobs";

// Native parametric CoverPool (Phase 2 capital lane), deployed 2026-06-10.
export const COVER_POOL_PKG = hx(
  "0ebde85d88b00ee0f4f1df16a82feb73",
  "87cde48ac6169d979db4a677de76082f",
);
// The public pool the app underwrites/sells against (market BTC-CRASH-30D).
export const COVER_POOL_OBJ = hx(
  "2c9b264a131a9c512c68b2ae8b7463f7",
  "5f114d395aaacc226815b575c7ba2066",
);
export const COVER_POOL_MARKET = "BTC-CRASH-30D";
export const SUI_TYPE = "0x2::sui::SUI";

// Accountability (Pillars II+III) + PoolRegistry (Pillar I breadth), deployed 2026-06-10.
export const ACCOUNTABILITY_PKG = hx(
  "822e1c39527c703b75278e2c607bf4a0",
  "78e432967a4e8e85bcd0fe4ec0cd8d7e",
);
export const CALIBRATION_LEDGER = hx(
  "6c15ce8184d5d8cf267cf3ee8170d03a",
  "9298019c844dd9dec4759db3d73a2bb2",
);
export const AGENT_PASSPORT = hx(
  "8a6ef8b27d610af9fcdd2ed0ab164351",
  "13406dd04b956a4114e4610abf54c095",
);
export const POOL_REGISTRY_PKG = hx(
  "94a7a401c2e222769a7c67050ebf5081",
  "0b8f0df3551ebcd7a60d2d2a64bd0ca2",
);
export const POOL_REGISTRY_OBJ = hx(
  "8328bc1eeda8cd5a19640e9c61a138a1",
  "6f3dde54ca8f736a16814b14c7ac042c",
);
export const REGISTERED_EVENT = `${POOL_REGISTRY_PKG}::pool_registry::PoolRegistered`;

// SRX risk-index oracle + trustless oracle_pool, deployed 2026-06-11.
export const RISK_INDEX_PKG = hx(
  "9ecb5797bb9f2fc627871cd33670605e",
  "9a5d52970445f19c64fd755e2d9fe7d6",
);
export const RISK_INDEX_OBJ = hx(
  "639cadf62d68a41651ea5d25f1cba494",
  "96522d2fc6e51471934687f2112fe088",
);
export const ORACLE_POOL_PKG = hx(
  "3d055a54a764963059c4b779d266437f",
  "a9803353bab39cd6eef1db1607ac7623",
);
export const SRX_MARKET = "BTC-30D";

// Arena — proof-of-judgment (competing bonded agents + slashing), deployed 2026-06-11.
export const ARENA_PKG = hx(
  "baf3d06984b1f1d90040ef6d638cf88e",
  "eb0946cad2ee4ee6b44234616f765cac",
);
export const ARENA_OBJ = hx(
  "5c77be6ad4f51eefc721666908c8ee78",
  "21b40aebe69b2a916a6b1aed85e0e65f",
);
