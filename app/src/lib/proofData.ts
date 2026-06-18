import { PREDICT_OBJ } from "./ids";
import { RISK_FEED_OBJ, RISK_FEED_PKG, WALRUS_AGGREGATOR } from "./deployment";

export type ProofRecord = {
  label: string;
  value: string;
  href?: string;
  helper?: string;
};

type ProofSafety = "UNAUDITED" | "DEMO SCALE" | "ADMIN CONTROLLED";
type ProofEvidence = "LIVE READ" | "CAPTURED TX" | "STAGED PROOF";

export type ProofPack = {
  network: "testnet" | "mainnet";
  chain: "sui:testnet" | "sui:mainnet";
  title: string;
  safety: ProofSafety;
  riskFeed?: {
    packageId: string;
    feedObjectId: string;
    publisherCap: string;
    publishDigest: string;
    readingsDigest: string;
  };
  predict?: {
    managerId: string;
    objectId: string;
  };
  depegPool?: {
    packageId: string;
    poolId: string;
    priceObjectId: string;
    custody: string;
    verifier: string;
    upgradeCapLocked: boolean;
  };
  stagedClaim?: {
    digest: string;
    market: string;
    coverUsd: number;
    premiumDusdc: number;
    status: "active" | "settled" | "expired";
  };
  productionActivePolicy?: {
    objectId: string;
    status: "active" | "armed" | "expired" | "unknown";
  };
  keeperPolicies?: {
    label: string;
    objectId: string;
    status: "active" | "armed" | "claimable" | "expired" | "unknown";
  }[];
  walrus: {
    aggregator: string;
  };
};

export const TESTNET_PROOF_PACK: ProofPack = {
  network: "testnet",
  chain: "sui:testnet",
  title: "RiskFeed + Predict testnet lane",
  safety: "DEMO SCALE",
  riskFeed: {
    packageId: RISK_FEED_PKG,
    feedObjectId: RISK_FEED_OBJ,
    publisherCap:
      "0xf74913abfb1f51ddb602958b186c22adb494f62f1dee87f18619c946d9d0bcb4",
    publishDigest: "DR3VpymbSeMFwo6uGuc6x4jCF4cFyTNhRrXWMYwNKZNB",
    readingsDigest: "Ad5Fcr6otec41vioS5mTPJGY89GaaKcQPdRUZc2bvbEz",
  },
  predict: {
    managerId:
      "0x630f524dfb52a42fb112c161e03d15772386e1916e2d6f02c4f987bc99b123ac",
    objectId: PREDICT_OBJ,
  },
  stagedClaim: {
    digest: "G2X8UFPRjgYf76dA7FBziGg6cyUAkoepGnTuCakzCcBP",
    market: "BTC<56901@1780992000000",
    coverUsd: 10,
    premiumDusdc: 0.288596,
    status: "active",
  },
  walrus: {
    aggregator: WALRUS_AGGREGATOR,
  },
};

export const MAINNET_DEPEG_PROOF_PACK: ProofPack = {
  network: "mainnet",
  chain: "sui:mainnet",
  title: "Production depeg cover lane (suiUSDe)",
  safety: "ADMIN CONTROLLED",
  depegPool: {
    packageId:
      "0x761832702281966fac9dee6183b530d2f73ecd779524c61cd3dd4705fa6ec968",
    poolId:
      "0x5edc508a4258e1253563219049dadc8b068cf309115e29732dad71698c168592",
    priceObjectId:
      "0x9b2028bfc829127d2e5ead1691dc3002de9e9b8d8076b4915e5ecc7d9b99d63f",
    custody: "Pool is shared; policy and LP share objects are owner-accounted",
    verifier: "Pyth PriceInfo object with live on-chain oracle checks",
    upgradeCapLocked: true,
  },
  productionActivePolicy: {
    objectId:
      "0x3863ad1bf44904af1fcc3ead38589977378e6800e14ceacebf1205187ce695ec",
    status: "active",
  },
  keeperPolicies: [
    {
      label: "Production active policy",
      objectId:
        "0x3863ad1bf44904af1fcc3ead38589977378e6800e14ceacebf1205187ce695ec",
      status: "active",
    },
  ],
  walrus: {
    aggregator: "https://walrus-mainnet.walrus.space/v1/blobs",
  },
};

export type ProofCheck = {
  label: string;
  status: "PASS" | "WARN" | "FAIL";
  network: "MAINNET" | "TESTNET";
  evidence: ProofEvidence;
  safety: ProofSafety;
  value: string;
  note: string;
  link?: string;
};

export const PROOF_PACKS: ProofPack[] = [
  TESTNET_PROOF_PACK,
  MAINNET_DEPEG_PROOF_PACK,
];
