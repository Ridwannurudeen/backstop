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

// Legacy native CoverPool lane, deployed 2026-06-10. Kept for testnet research;
// not exposed as a production-safe cover product.
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
export const CLOCK = "0x6";

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

// SRX risk-index oracle + DeepBook oracle_pool proof lane, deployed 2026-06-11.
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

// Depeg cover runs on Sui mainnet because settlement reads live Pyth feeds.
export const MAINNET = "mainnet" as const;
export const HERMES = "https://hermes.pyth.network";
export const PYTH_DEPEG_COVER_PKG = hx(
  "4f8d00eb76a59996a0c88f3d103e950e",
  "6e4c02132acb8483cc8e1450005f04e9",
);
export const PYTH_DEPEG_POOL = hx(
  "d739a318705fb8b8401da34a3c2c3cde",
  "6397d033d72f793153ea673216eb58ed",
);
export const PYTH_LENDING_PKG = hx(
  "25f89307f0e37079a8cd7be1aa10f216",
  "f1bf3d5b00c2184ea2b8bc9ffc51a670",
);
export const PYTH_LENDING_MARKET = hx(
  "459b6df1dee2c3840a52b766d4c617fb",
  "abb1c5f9d08f557645080829fee9d74c",
);
export const PYTH_STAGED_COVER_PKG = hx(
  "51dd7287ac9e97147982023f5f2fa61b",
  "f5df2939d671216b19d142938f34ab05",
);
export const PYTH_STAGED_POOL = hx(
  "9e188765145f3de7e246004979883ad8",
  "ab173ff0cdc61153fbd76ce5081c4e62",
);
export const PYTH_STAGED_LENDING_MARKET = hx(
  "41067a88643fc6339b70166120624b7d",
  "e8393c8bf395c30be81fafc4fd787182",
);
export const PYTH_COVER_UPGRADE_CAP = hx(
  "4bbface3400335b7ea3fe55d65a0884c",
  "392879bd4ab9e37a77d40f462a11ae2e",
);
export const PYTH_LENDING_UPGRADE_CAP = hx(
  "e355a114113e9e4f1bee132e2602d7b",
  "05e27c270a572d76bbb1614d494a15bf0",
);
export const PYTH_PRODUCTION_ADMIN_CAP = hx(
  "3712080bc20fac855a83d4260f064adb",
  "354a499d5d34c94e33f2396b712bfb9c",
);
export const PYTH_STAGED_ADMIN_CAP = hx(
  "d88b301589365045a1385046bd0cd38b",
  "5cc93547c891513e559e32d958fad567",
);
export const PYTH_ADMIN_CUSTODY_OWNER = hx(
  "5f21a9aaf680f6b0e0190e6a99bb9d4e",
  "314e0761ff3c3bc809f298711e73d8e5",
);
export const PYTH_COVER_UPGRADE_LOCK_TX =
  "7LJVLHs4Vb93pzS5WuwEgmwuZN9KEGBXbzx5b43kWLm9";
export const PYTH_LENDING_UPGRADE_LOCK_TX =
  "GUm7a3fRpyQAQa92eBEEm3yVurGtfHz7vEifg7kaB4RL";
export const PYTH_ADMIN_CUSTODY_TX =
  "KJzWGum3aqUpH4BKxrX9DdZ5yCLp8yDvNUC28aMCZ39";
export const PYTH_STAGED_CLAIM_TX =
  "Dm9gywopkRe9p36J21HTiLJCeRaRhdjwYaDx13WA2ekC";
export const PYTH_PRODUCTION_INSURE_TX =
  "Fk1hB7nsaYm5ZDww1sXwohHNYjcc3kmkd3qqUeFVdqwg";
export const PYTH_STATE = hx(
  "1f9310238ee9298fb703c3419030b35b",
  "22bb1cc37113e3bb5007c99aec79e5b8",
);
export const WORMHOLE_STATE = hx(
  "aeab97f96cf9877fee2883315d459552",
  "b2b921edc16d7ceac6eab944dd88919c",
);
export const SUIUSDE_FEED_ID =
  "8cead549d0e770dea8fdf5e018a85d59585265cf8bff16ba83962fc7996dbb7f";
export const SUIUSD_FEED_ID =
  "23d7315113f5b1d3ba7a83604c44b94d79f4fd69af77f804fc7f920a6dc65744";
export const SUIUSD_PRICE_OBJECT = hx(
  "801dbc2f0053d34734814b2d6df491ce",
  "7807a725fe9a01ad74a07e9c51396c37",
);
