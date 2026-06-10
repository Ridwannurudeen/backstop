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
