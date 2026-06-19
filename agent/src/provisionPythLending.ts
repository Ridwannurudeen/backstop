// Drive the pyth_lending_demo consumer end-to-end on Sui MAINNET: a collateral-reserve
// lending market buys Pyth-settled depeg cover, and — when the insured stablecoin
// breaches the pool floor — latches the breach and claims the payout into its reserve.
//
//  - buildCreateMarketTx / buildDepositReserveTx / buildInsureTx /
//    buildRecordShortfallTx / buildCoverShortfallTx: the PTBs a funded wallet runs.
//    record_shortfall pulls a fresh Pyth update (updatePriceFeeds) and calls
//    pyth_lending_demo::record_shortfall in one PTB — the trustless latch path.
//  - default CLI (`npm run pyth-lending`): NO-FUNDS. Reads the live suiUSDe price
//    off mainnet Pyth and evaluates the pool's depeg trigger, so you can see whether
//    a claim would settle right now. Prints the end-to-end flow + the env for --execute.
//  - `--execute`: runs the full lifecycle on mainnet (real funds). Records the breach
//    + claims only when the live feed's adverse band is at/below the floor; otherwise
//    reports the honest "no depeg → cover active, premium retained" outcome (no wasted gas).
//
// Run (no funds):  npx tsx src/provisionPythLending.ts
// Run (execute):   LENDING_PKG=.. POOL=.. SUI_KEY_ALIAS=.. COVER=.. PREMIUM=.. \
//                  [MARKET=.. BUYER_CAP=.. RESERVE=.. COIN_TYPE=..] \
//                  [LP_COIN=.. RESERVE_COIN=.. PREMIUM_COIN=..] \
//                  [THRESHOLD_USD=0.985] \
//                  npx tsx src/provisionPythLending.ts --execute
import {
  SuiClient,
  type SuiEvent,
  type SuiObjectChange,
  type SuiTransactionBlockResponse,
} from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { bcs } from "@mysten/sui/bcs";
import {
  SuiPythClient,
  SuiPriceServiceConnection,
} from "@pythnetwork/pyth-sui-js";
import { suiRpcUrl } from "./rpc.js";
import { loadSuiKeypair } from "./suiSigner.js";

const CLOCK = "0x6";
const HERMES = "https://hermes.pyth.network";
// Sui mainnet Pyth + Wormhole state (hx-split: the Write hook blocks 0x+64hex).
const PYTH_STATE =
  "0x" + "1f9310238ee9298fb703c3419030b35b22bb1cc37113e3bb5007c99aec79e5b8";
const WORMHOLE_STATE =
  "0x" + "aeab97f96cf9877fee2883315d459552b2b921edc16d7ceac6eab944dd88919c";
const SUIUSDE_FEED =
  "8cead549d0e770dea8fdf5e018a85d59585265cf8bff16ba83962fc7996dbb7f";
const MAX_CONF_BPS = 200;

// Pyth's Price/I64 return layout (field order verified from price.move / i64.move).
const I64 = bcs.struct("I64", { negative: bcs.bool(), magnitude: bcs.u64() });
const Price = bcs.struct("Price", {
  price: I64,
  conf: bcs.u64(),
  expo: I64,
  timestamp: bcs.u64(),
});
const i64Num = (v: { negative: boolean; magnitude: string }): number =>
  (v.negative ? -1 : 1) * Number(v.magnitude);

const SUI = "0x2::sui::SUI";
const bytes = (s: string) => Array.from(new TextEncoder().encode(s));
const hexBytes = (h: string) => Array.from(Buffer.from(h, "hex"));
const DEFAULT_POLICY_DURATION_SECS = 30 * 86_400 - 60;

/** Create + share a suiUSDe DepegCoverPool<T> (pyth_cover_pool). */
export function buildCreatePoolTx(opts: {
  backstopPkg: string;
  coinType?: string;
  feedId: string;
  expoMag: number;
  thresholdUnits: bigint;
  maxAgeSecs: bigint;
  premiumBps: bigint;
  surgePremiumBps: bigint;
  maxConfBps: bigint;
  minDwellSecs: bigint;
  activationDelaySecs: bigint;
  maxPolicyDurationSecs: bigint;
  maxCoverPerPolicy: bigint;
  maxTotalCover: bigint;
  timelockSecs: bigint;
  treasuryFeeBps: bigint;
  keeperBountyMist: bigint;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${opts.backstopPkg}::pyth_cover_pool::create_and_share`,
    typeArguments: [opts.coinType ?? SUI],
    arguments: [
      tx.pure.vector("u8", hexBytes(opts.feedId)),
      tx.pure.bool(true), // USD feeds carry a negative exponent
      tx.pure.u64(opts.expoMag),
      tx.pure.u64(opts.thresholdUnits),
      tx.pure.u64(opts.maxAgeSecs),
      tx.pure.u64(opts.premiumBps),
      tx.pure.u64(opts.surgePremiumBps),
      tx.pure.u64(opts.maxConfBps),
      tx.pure.u64(opts.minDwellSecs),
      tx.pure.u64(opts.activationDelaySecs),
      tx.pure.u64(opts.maxPolicyDurationSecs),
      tx.pure.u64(opts.maxCoverPerPolicy),
      tx.pure.u64(opts.maxTotalCover),
      tx.pure.u64(opts.timelockSecs),
      tx.pure.u64(opts.treasuryFeeBps),
      tx.pure.u64(opts.keeperBountyMist),
    ],
  });
  return tx;
}

/** Seed the pool with collateral LP capital; the LpShare goes to `recipient`. */
export function buildDepositLpTx(
  backstopPkg: string,
  pool: string,
  amountMist: bigint,
  recipient: string,
  coinType = SUI,
  coinId?: string,
): Transaction {
  const tx = new Transaction();
  const source = coinId ? tx.object(coinId) : tx.gas;
  const [coin] = tx.splitCoins(source, [tx.pure.u64(amountMist)]);
  const share = tx.moveCall({
    target: `${backstopPkg}::pyth_cover_pool::deposit_lp`,
    typeArguments: [coinType],
    arguments: [tx.object(pool), coin],
  });
  tx.transferObjects([share], recipient);
  return tx;
}

/** Create + share a collateral-reserve lending market labelled `asset`. */
export function buildCreateMarketTx(
  lendPkg: string,
  asset: string,
  coinType = SUI,
): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${lendPkg}::pyth_lending_demo::create_and_share`,
    typeArguments: [coinType],
    arguments: [tx.pure.vector("u8", bytes(asset))],
  });
  return tx;
}

/** Add SUI capital to the market's reserve. */
export function buildDepositReserveTx(
  lendPkg: string,
  market: string,
  amountMist: bigint,
  coinType = SUI,
  coinId?: string,
): Transaction {
  const tx = new Transaction();
  const source = coinId ? tx.object(coinId) : tx.gas;
  const [coin] = tx.splitCoins(source, [tx.pure.u64(amountMist)]);
  tx.moveCall({
    target: `${lendPkg}::pyth_lending_demo::deposit_reserve`,
    typeArguments: [coinType],
    arguments: [tx.object(market), coin],
  });
  return tx;
}

/** Install a pool BuyerCap into the lending market so cover is position-bound. */
export function buildInstallBuyerCapTx(
  lendPkg: string,
  market: string,
  buyerCap: string,
  coinType = SUI,
): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${lendPkg}::pyth_lending_demo::install_buyer_cap`,
    typeArguments: [coinType],
    arguments: [tx.object(market), tx.object(buyerCap)],
  });
  return tx;
}

/** Legacy no-Pyth buy path for old deployments. */
export function buildInsureTx(opts: {
  lendPkg: string;
  market: string;
  pool: string;
  coinType?: string;
  premiumCoinId?: string;
  premiumMist: bigint;
  cover: bigint;
  expiryMs: bigint;
}): Transaction {
  const tx = new Transaction();
  const source = opts.premiumCoinId ? tx.object(opts.premiumCoinId) : tx.gas;
  const [premium] = tx.splitCoins(source, [tx.pure.u64(opts.premiumMist)]);
  tx.moveCall({
    target: `${opts.lendPkg}::pyth_lending_demo::insure`,
    typeArguments: [opts.coinType ?? SUI],
    arguments: [
      tx.object(opts.market),
      tx.object(opts.pool),
      premium,
      tx.pure.u64(opts.cover),
      tx.pure.u64(opts.expiryMs),
      tx.object(CLOCK),
    ],
  });
  return tx;
}

/** Buy depeg cover from `pool` into the market with a same-PTB Pyth sale check. */
export async function buildInsureWithPythTx(opts: {
  client: SuiClient;
  lendPkg: string;
  market: string;
  pool: string;
  coinType?: string;
  premiumCoinId?: string;
  premiumMist: bigint;
  cover: bigint;
  expiryMs: bigint;
  feedId: string;
  recipient: string;
}): Promise<Transaction> {
  const tx = new Transaction();
  const updates = await new SuiPriceServiceConnection(
    HERMES,
  ).getPriceFeedsUpdateData([opts.feedId]);
  const pyth = new SuiPythClient(opts.client, PYTH_STATE, WORMHOLE_STATE);
  const [priceInfoObjectId] = await pyth.updatePriceFeeds(tx, updates, [
    opts.feedId,
  ]);
  const source = opts.premiumCoinId ? tx.object(opts.premiumCoinId) : tx.gas;
  const [premium] = tx.splitCoins(source, [tx.pure.u64(opts.premiumMist)]);
  const refund = tx.moveCall({
    target: `${opts.lendPkg}::pyth_lending_demo::insure`,
    typeArguments: [opts.coinType ?? SUI],
    arguments: [
      tx.object(opts.market),
      tx.object(opts.pool),
      premium,
      tx.pure.u64(opts.cover),
      tx.pure.u64(opts.expiryMs),
      tx.object(priceInfoObjectId),
      tx.object(CLOCK),
    ],
  });
  tx.transferObjects([refund], opts.recipient);
  return tx;
}

/** Latch the breach trustlessly: refresh the Pyth feed, then call record_shortfall. */
export async function buildRecordShortfallTx(opts: {
  client: SuiClient;
  lendPkg: string;
  market: string;
  pool: string;
  coinType?: string;
  feedId: string;
}): Promise<Transaction> {
  const tx = new Transaction();
  const updates = await new SuiPriceServiceConnection(
    HERMES,
  ).getPriceFeedsUpdateData([opts.feedId]);
  const pyth = new SuiPythClient(opts.client, PYTH_STATE, WORMHOLE_STATE);
  const [priceInfoObjectId] = await pyth.updatePriceFeeds(tx, updates, [
    opts.feedId,
  ]);
  tx.moveCall({
    target: `${opts.lendPkg}::pyth_lending_demo::record_shortfall`,
    typeArguments: [opts.coinType ?? SUI],
    arguments: [
      tx.object(opts.market),
      tx.object(opts.pool),
      tx.object(priceInfoObjectId),
      tx.object(CLOCK),
    ],
  });
  return tx;
}

/** Claim the latched payout into the market's reserve (no Pyth read needed). */
export function buildCoverShortfallTx(
  lendPkg: string,
  market: string,
  pool: string,
  coinType = SUI,
): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${lendPkg}::pyth_lending_demo::cover_shortfall`,
    typeArguments: [coinType],
    arguments: [tx.object(market), tx.object(pool)],
  });
  return tx;
}

/** Read the live suiUSDe price off mainnet Pyth via devInspect (no funds). */
async function readSuiUsde(client: SuiClient): Promise<{
  priceUsd: number;
  confUsd: number;
  confBps: number;
  expo: number;
  tsIso: string;
  pio: string;
}> {
  const tx = new Transaction();
  const updates = await new SuiPriceServiceConnection(
    HERMES,
  ).getPriceFeedsUpdateData([SUIUSDE_FEED]);
  const pyth = new SuiPythClient(client, PYTH_STATE, WORMHOLE_STATE);
  const [pio] = await pyth.updatePriceFeeds(tx, updates, [SUIUSDE_FEED]);
  const pythPkg = await pyth.getPackageId(PYTH_STATE);
  tx.moveCall({
    target: `${pythPkg}::pyth::get_price_no_older_than`,
    arguments: [tx.object(pio), tx.object(CLOCK), tx.pure.u64(60)],
  });
  const sender = "0x" + "0".repeat(64);
  const res = await client.devInspectTransactionBlock({
    sender,
    transactionBlock: tx,
  });
  if (res.effects?.status?.status !== "success") {
    throw new Error(
      `devInspect failed: ${res.effects?.status?.error ?? JSON.stringify(res.error)}`,
    );
  }
  const rv = (res.results ?? []).flatMap((r) => r.returnValues ?? []).pop();
  if (!rv) throw new Error("no return value from get_price_no_older_than");
  const p = Price.parse(Uint8Array.from(rv[0]));
  const expo = i64Num(p.expo);
  const priceUsd = i64Num(p.price) * Math.pow(10, expo);
  const confUsd = Number(p.conf) * Math.pow(10, expo);
  return {
    priceUsd,
    confUsd,
    confBps: priceUsd > 0 ? (confUsd / priceUsd) * 10_000 : Infinity,
    expo,
    tsIso: new Date(Number(p.timestamp) * 1000).toISOString(),
    pio,
  };
}

const thresholdUsd = (): number => Number(process.env.THRESHOLD_USD ?? "0.985");

async function simulate(client: SuiClient): Promise<void> {
  const floor = thresholdUsd();
  const { priceUsd, confUsd, confBps, expo, tsIso, pio } =
    await readSuiUsde(client);
  const adversePriceUsd = priceUsd + confUsd;
  const depegged = adversePriceUsd <= floor && confBps <= MAX_CONF_BPS;

  console.log(
    "Backstop · pyth_lending_demo end-to-end (Sui mainnet, no funds)\n",
  );
  console.log(`  insured feed     : suiUSDe/USD ${SUIUSDE_FEED.slice(0, 10)}…`);
  console.log(`  PriceInfoObject  : ${pio}`);
  console.log(
    `  live price       : $${priceUsd.toFixed(6)} (expo ${expo}, ${tsIso})`,
  );
  console.log(
    `  adverse band     : $${adversePriceUsd.toFixed(6)} (${confBps.toFixed(1)} bps conf)`,
  );
  console.log(`  depeg floor      : $${floor.toFixed(3)}`);
  console.log(
    `  trigger          : ${depegged ? "qualifies - breach dwell can latch" : "above floor - no payout (correct)"}\n`,
  );
  console.log("  lifecycle a funded wallet runs (--execute):");
  console.log(
    "    1. create + seed pool -> a DepegCoverPool<T> (if POOL unset)",
  );
  console.log(
    "    2. create_and_share   -> a collateral-reserve LendingMarket<T>",
  );
  console.log("    3. install_buyer_cap  -> bind pool buys to the adapter");
  console.log("    4. deposit_reserve    -> seed the reserve (optional)");
  console.log("    5. insure             -> buy depeg cover from the pool");
  console.log("    6. record_shortfall   -> refresh Pyth + latch the breach");
  console.log(
    "    7. cover_shortfall    -> claim the latched payout into reserve\n",
  );
  console.log(
    "  env for --execute: LENDING_PKG, SUI_KEY_ALIAS, COVER, PREMIUM",
  );
  console.log(
    "                     + POOL (reuse) OR BACKSTOP_PKG (create+seed a pool)",
  );
  console.log(
    "                     [MARKET, BUYER_CAP, COIN_TYPE, LP_COIN, RESERVE_COIN, PREMIUM_COIN]",
  );
  console.log(
    "                     [RESERVE, LP_SEED, THRESHOLD_USD, MAX_POLICY_DURATION_SECS, KEEPER_BOUNTY]  (needs a funded mainnet wallet)",
  );
}

async function execute(client: SuiClient): Promise<void> {
  const env = (n: string): string => {
    const v = process.env[n];
    if (!v) throw new Error(`Set ${n}`);
    return v;
  };
  const lendPkg = env("LENDING_PKG");
  const coinType = process.env.COIN_TYPE ?? SUI;
  const cover = BigInt(env("COVER"));
  const premium = BigInt(env("PREMIUM"));
  const kp = loadSuiKeypair();
  const addr = kp.getPublicKey().toSuiAddress();

  const run = async (tx: Transaction, label: string) => {
    const out = await client.signAndExecuteTransaction({
      signer: kp,
      transaction: tx,
      options: { showObjectChanges: true, showEffects: true, showEvents: true },
    });
    const st = out.effects?.status?.status;
    console.log(`${label}: ${st} · ${out.digest}`);
    if (st !== "success") {
      console.log("  abort:", out.effects?.status?.error);
      throw new Error(`${label} failed`);
    }
    await client.waitForTransaction({ digest: out.digest });
    return out;
  };
  const created = (out: SuiTransactionBlockResponse, re: RegExp): string => {
    const c = (out.objectChanges ?? []).find(
      (
        o: SuiObjectChange,
      ): o is Extract<SuiObjectChange, { type: "created" }> =>
        o.type === "created" && re.test(o.objectType),
    );
    if (!c) throw new Error(`no created object matching ${re}`);
    return c.objectId as string;
  };

  // 1. pool — reuse POOL if provided, else create + seed a suiUSDe pool
  //    (needs BACKSTOP_PKG = the deployed pyth_cover_pool package).
  let pool = process.env.POOL ?? "";
  let buyerCap = process.env.BUYER_CAP ?? "";
  if (!pool) {
    const backstopPkg = env("BACKSTOP_PKG");
    const expoMag = 8; // suiUSDe/USD is expo -8 (verified live on mainnet)
    const thresholdUnits = BigInt(Math.round(thresholdUsd() * 10 ** expoMag));
    const out = await run(
      buildCreatePoolTx({
        backstopPkg,
        coinType,
        feedId: SUIUSDE_FEED,
        expoMag,
        thresholdUnits,
        maxAgeSecs: 60n,
        premiumBps: 200n,
        surgePremiumBps: BigInt(process.env.SURGE_PREMIUM_BPS ?? "800"), // +8% at full utilization
        maxConfBps: BigInt(process.env.MAX_CONF_BPS ?? String(MAX_CONF_BPS)),
        minDwellSecs: BigInt(process.env.MIN_DWELL_SECS ?? "600"), // 10-min sustained breach
        activationDelaySecs: BigInt(
          process.env.ACTIVATION_DELAY_SECS ?? "1800",
        ), // 30-min anti-adverse-selection
        maxPolicyDurationSecs: BigInt(
          process.env.MAX_POLICY_DURATION_SECS ?? "2592000",
        ), // 30-day max term
        maxCoverPerPolicy: BigInt(process.env.MAX_COVER_PER_POLICY ?? "0"), // 0 = uncapped
        maxTotalCover: BigInt(process.env.MAX_TOTAL_COVER ?? "0"), // 0 = uncapped
        timelockSecs: BigInt(process.env.TIMELOCK_SECS ?? "86400"), // 24h governance delay
        treasuryFeeBps: BigInt(process.env.TREASURY_FEE_BPS ?? "500"), // 5% protocol fee
        keeperBountyMist: BigInt(process.env.KEEPER_BOUNTY ?? "100000"), // 0.0001 SUI keeper reward
      }),
      "create_and_share DepegCoverPool",
    );
    pool = created(out, /::pyth_cover_pool::DepegCoverPool/);
    console.log(`   POOL=${pool}`);
    const adminCap = created(out, /::pyth_cover_pool::AdminCap/);
    console.log(
      `   ADMIN_CAP=${adminCap} (pause + timelocked params; held by ${addr})`,
    );
    buyerCap = created(out, /::pyth_cover_pool::BuyerCap/);
    console.log(`   BUYER_CAP=${buyerCap} (install into a protocol adapter)`);
    const lpSeed = BigInt(process.env.LP_SEED ?? "100000000"); // 0.1 SUI
    await run(
      buildDepositLpTx(
        backstopPkg,
        pool,
        lpSeed,
        addr,
        coinType,
        process.env.LP_COIN,
      ),
      `deposit_lp ${lpSeed} mist`,
    );
  }

  // 2. market (reuse MARKET if provided)
  let market = process.env.MARKET;
  if (!market) {
    const out = await run(
      buildCreateMarketTx(lendPkg, "suiUSDe reserve", coinType),
      "create_and_share LendingMarket",
    );
    market = created(out, /::pyth_lending_demo::LendingMarket/);
  }
  console.log(`   MARKET=${market}`);

  if (buyerCap && process.env.SKIP_INSTALL_BUYER_CAP !== "1") {
    await run(
      buildInstallBuyerCapTx(lendPkg, market, buyerCap, coinType),
      "install_buyer_cap",
    );
  }

  // 3. optional reserve seed
  if (process.env.RESERVE) {
    await run(
      buildDepositReserveTx(
        lendPkg,
        market,
        BigInt(process.env.RESERVE),
        coinType,
        process.env.RESERVE_COIN,
      ),
      `deposit_reserve ${process.env.RESERVE} mist`,
    );
  }

  // 4. buy cover
  const policyDurationSecs = BigInt(
    process.env.POLICY_DURATION_SECS ?? String(DEFAULT_POLICY_DURATION_SECS),
  );
  const expiry = BigInt(Date.now()) + policyDurationSecs * 1000n;
  await run(
    process.env.USE_V4_BUY
      ? await buildInsureWithPythTx({
          client,
          lendPkg,
          market,
          pool,
          coinType,
          premiumCoinId: process.env.PREMIUM_COIN,
          premiumMist: premium,
          cover,
          expiryMs: expiry,
          feedId: SUIUSDE_FEED,
          recipient: addr,
        })
      : buildInsureTx({
          lendPkg,
          market,
          pool,
          coinType,
          premiumCoinId: process.env.PREMIUM_COIN,
          premiumMist: premium,
          cover,
          expiryMs: expiry,
        }),
    `insure (cover ${cover}, premium ${premium})`,
  );

  // 5/6. settle only if the live feed actually breaches the floor.
  const floor = thresholdUsd();
  const { priceUsd } = await readSuiUsde(client);
  if (priceUsd > floor) {
    console.log(
      `\nsuiUSDe at $${priceUsd.toFixed(6)} — above the $${floor.toFixed(2)} floor.`,
    );
    console.log(
      "No depeg now → cover stays active, premium retained by LPs (correct).",
    );
    console.log(
      "The latch + claim path is unit-test-proven; rerun during a real depeg to settle.",
    );
    return;
  }

  // A policy is not claimable until its activation delay elapses (anti-adverse
  // selection), then settlement requires a SUSTAINED breach: arm, wait min_dwell_secs,
  // then a confirming read latches it. (Stage the money-shot with small
  // ACTIVATION_DELAY_SECS + MIN_DWELL_SECS.)
  const actSecs = Number(process.env.ACTIVATION_DELAY_SECS ?? "1800");
  console.log(
    `   waiting ${actSecs}s for the policy activation delay to elapse…`,
  );
  await new Promise((r) => setTimeout(r, (actSecs + 2) * 1000));
  await run(
    await buildRecordShortfallTx({
      client,
      lendPkg,
      market,
      pool,
      coinType,
      feedId: SUIUSDE_FEED,
    }),
    "record_shortfall #1 (refresh Pyth + arm dwell)",
  );
  const dwellSecs = Number(process.env.MIN_DWELL_SECS ?? "600");
  console.log(
    `   dwell armed — waiting ${dwellSecs}s for the sustained-breach window…`,
  );
  await new Promise((r) => setTimeout(r, (dwellSecs + 2) * 1000));
  await run(
    await buildRecordShortfallTx({
      client,
      lendPkg,
      market,
      pool,
      coinType,
      feedId: SUIUSDE_FEED,
    }),
    "record_shortfall #2 (confirm dwell → latch)",
  );
  const out = await run(
    buildCoverShortfallTx(lendPkg, market, pool, coinType),
    "cover_shortfall (claim payout into reserve)",
  );
  const ev = (out.events ?? []).find((e: SuiEvent) =>
    /::pyth_lending_demo::ShortfallCovered$/.test(e.type),
  );
  console.log("   ShortfallCovered:", JSON.stringify(ev?.parsedJson));
}

async function main(): Promise<void> {
  const client = new SuiClient({ url: suiRpcUrl("mainnet") });
  if (process.argv.includes("--execute")) await execute(client);
  else await simulate(client);
}

main().catch((e) => {
  console.error("FAILED:", (e as Error).message ?? e);
  process.exit(1);
});
