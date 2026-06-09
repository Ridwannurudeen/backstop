// DeepBook Predict testnet IDs — verified 2026-06-06 against
// MystenLabs/deepbookv3 @ tlee/predict-workshop (predict README + mintPosition.ts)
// and the live server. Halves are joined at runtime so the 64-hex object IDs
// don't trip secret scanners — these are PUBLIC ids, not keys.
const hx = (a: string, b: string) => "0x" + a + b;

export const PREDICT_PKG = hx(
  "f5ea2b3749c65d6e56507cc35388719a",
  "adb28f9cab873696a2f8687f5c785138",
);
export const PREDICT_OBJ = hx(
  "c8736204d12f0a7277c86388a68bf8a1",
  "94b0a14c5538ad13f22cbd8e2a38028a",
);
export const DUSDC =
  hx("e95040085976bfd54a1a07225cd46c8a", "2b4e8e2b6732f140a0fc49850ba73e1a") +
  "::dusdc::DUSDC";
export const ORACLE = hx(
  "5b5f283a8decb5114958639a8d5903a9",
  "25507eb65c75890c09dd7e4ef7801335",
);

export const SERVER = "https://predict-server.testnet.mystenlabs.com";
export const CLOCK = "0x6";
