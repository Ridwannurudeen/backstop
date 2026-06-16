import { useEffect, useMemo, useState } from "react";
import type { Transaction } from "@mysten/sui/transactions";
import {
  ConnectButton,
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
  useSuiClientContext,
} from "@mysten/dapp-kit";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  buildDepegBuyCoverTx,
  buildDepegClaimLatchedTx,
  buildDepegDepositLpTx,
  buildDepegRecordBreachTx,
  buildDepegWithdrawLpTx,
  fetchMyDepegPolicies,
  fetchMyDepegShares,
  isDepegConfigComplete,
  loadDepegConfig,
  MIST_PER_SUI,
  quoteDepegPremium,
  readDepegPool,
  saveDepegConfig,
  toMist,
} from "../lib/depegPool";
import {
  fetchOwnedPositionObjects,
  fetchNaviExposure,
  fetchSuilendExposure,
  readPositionObject,
  type DepegPositionObject,
} from "../lib/depegPosition";
import { MAINNET } from "../lib/deployment";
import { sui } from "../lib/format";
import { readSuiUsdPrice } from "../lib/pythPrice";
import { Notice, type NoticeState } from "./Notice";
import "./terminal.css";

const COVER_TERMS = [7, 30, 90];
const DAY_MS = 86_400_000;

const compactDate = (ms: number) =>
  new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

const shareUnits = (shares: bigint) =>
  `${(Number(shares) / 1e9).toLocaleString("en-US", {
    maximumFractionDigits: 4,
  })} units`;

const bps = (value: number) => `${(value / 100).toFixed(2)}%`;

const dollars = (value: number) =>
  value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 1_000 ? 0 : 2,
  });

const duration = (secs: number) => {
  if (secs >= 86_400) return `${Math.round(secs / 86_400)}d`;
  if (secs >= 3_600) return `${Math.round(secs / 3_600)}h`;
  if (secs >= 60) return `${Math.round(secs / 60)}m`;
  return `${secs}s`;
};

const remaining = (ms: number) => {
  if (ms <= 0) return "ready";
  const mins = Math.ceil(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  return `${Math.ceil(mins / 60)}h`;
};

const thresholdUsd = (
  thresholdScaled: bigint,
  expoNeg: boolean,
  expoMag: number,
) => Number(thresholdScaled) * Math.pow(10, expoNeg ? -expoMag : expoMag);

const minBigint = (a: bigint, b: bigint) => (a < b ? a : b);

export default function DepegActions() {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const qc = useQueryClient();
  const { network, selectNetwork } = useSuiClientContext();
  const { mutateAsync: sign, isPending } = useSignAndExecuteTransaction();

  const saved = useMemo(loadDepegConfig, []);
  const [pkg, setPkg] = useState(saved.pkg);
  const [poolId, setPoolId] = useState(saved.poolId);
  const [depositSui, setDepositSui] = useState(0.1);
  const [coverSui, setCoverSui] = useState(0.05);
  const [termDays, setTermDays] = useState(30);
  const [positionObjectId, setPositionObjectId] = useState("");
  const [positionExposureSui, setPositionExposureSui] = useState(coverSui);
  const [selectedPositionId, setSelectedPositionId] = useState("");
  const [manualPosition, setManualPosition] =
    useState<DepegPositionObject | null>(null);
  const [positionReadError, setPositionReadError] = useState("");
  const [readingPosition, setReadingPosition] = useState(false);
  const [notice, setNotice] = useState<NoticeState | null>(null);

  const config = useMemo(
    () => ({ pkg: pkg.trim(), poolId: poolId.trim() }),
    [pkg, poolId],
  );
  const configured = isDepegConfigComplete(config);
  const onMainnet = network === MAINNET;
  const canRead = configured && onMainnet;

  useEffect(() => {
    saveDepegConfig(config);
  }, [config]);

  const { data: pool, error: poolError } = useQuery({
    queryKey: ["depeg-pool", network, config.pkg, config.poolId],
    queryFn: () => readDepegPool(client, config.poolId),
    enabled: canRead,
    refetchInterval: 15_000,
  });

  const { data: mine } = useQuery({
    queryKey: [
      "depeg-mine",
      network,
      account?.address,
      config.pkg,
      config.poolId,
    ],
    queryFn: async () => {
      if (!account) return { policies: [], shares: [] };
      const [policies, shares] = await Promise.all([
        fetchMyDepegPolicies(
          client,
          account.address,
          config.pkg,
          config.poolId,
        ),
        fetchMyDepegShares(client, account.address, config.pkg, config.poolId),
      ]);
      return { policies, shares };
    },
    enabled: canRead && !!account,
    refetchInterval: 15_000,
  });

  const {
    data: positionCandidates = [],
    error: positionError,
    isFetching: scanningPositions,
    refetch: refetchPositions,
  } = useQuery({
    queryKey: ["depeg-position-candidates", network, account?.address],
    queryFn: () => {
      if (!account) return Promise.resolve([]);
      return fetchOwnedPositionObjects(client, account.address);
    },
    enabled: onMainnet && !!account,
    staleTime: 30_000,
  });

  const {
    data: naviExposure,
    error: naviExposureError,
    isFetching: loadingNaviExposure,
    refetch: refetchNaviExposure,
  } = useQuery({
    queryKey: ["depeg-navi-exposure", network, account?.address],
    queryFn: () => {
      if (!account) {
        return Promise.resolve({
          lines: [],
          usdeLines: [],
          totalSupplyUsd: 0,
          totalBorrowUsd: 0,
          usdeSupplyUsd: 0,
          usdeBorrowUsd: 0,
        });
      }
      return fetchNaviExposure(client, account.address);
    },
    enabled: onMainnet && !!account,
    staleTime: 60_000,
  });

  const {
    data: suilendExposure,
    error: suilendExposureError,
    isFetching: loadingSuilendExposure,
    refetch: refetchSuilendExposure,
  } = useQuery({
    queryKey: ["depeg-suilend-exposure", network, account?.address],
    queryFn: () => {
      if (!account) {
        return Promise.resolve({
          lines: [],
          usdeLines: [],
          totalSupplyUsd: 0,
          totalBorrowUsd: 0,
          usdeSupplyUsd: 0,
          usdeBorrowUsd: 0,
          ownerCapCount: 0,
        });
      }
      return fetchSuilendExposure(client, account.address);
    },
    enabled: onMainnet && !!account,
    staleTime: 60_000,
  });

  const {
    data: suiUsdPrice,
    error: suiUsdError,
    isFetching: loadingSuiUsd,
  } = useQuery({
    queryKey: ["depeg-sui-usd", network],
    queryFn: () => readSuiUsdPrice(client),
    enabled: onMainnet,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const coverMist = toMist(coverSui);
  const premiumMist = pool ? quoteDepegPremium(pool, coverMist) : undefined;
  const totalShareUnits =
    mine?.shares.reduce((sum, share) => sum + share.shares, 0n) ?? 0n;
  const utilization =
    pool && pool.fundsMist > 0n
      ? Number((pool.totalCoverMist * 10_000n) / pool.fundsMist) / 100
      : 0;
  const collateralHeadroom =
    pool && pool.fundsMist > pool.totalCoverMist
      ? pool.fundsMist - pool.totalCoverMist
      : 0n;
  const capHeadroom =
    pool && pool.maxTotalCoverMist > 0n
      ? pool.maxTotalCoverMist > pool.totalCoverMist
        ? pool.maxTotalCoverMist - pool.totalCoverMist
        : 0n
      : collateralHeadroom;
  const underwritingHeadroom = pool
    ? minBigint(collateralHeadroom, capHeadroom)
    : 0n;
  const maxNewCover =
    pool && pool.maxCoverPerPolicyMist > 0n
      ? minBigint(underwritingHeadroom, pool.maxCoverPerPolicyMist)
      : underwritingHeadroom;
  const coverExceedsLimit = !!pool && coverMist > maxNewCover;
  const selectedWalletPosition = positionCandidates.find(
    (position) => position.id === selectedPositionId,
  );
  const importedPosition =
    manualPosition?.id.toLowerCase() === positionObjectId.trim().toLowerCase()
      ? manualPosition
      : selectedWalletPosition;
  const positionExposureMist =
    Number.isFinite(positionExposureSui) && positionExposureSui > 0
      ? toMist(positionExposureSui)
      : 0n;
  const sizedPositionCoverMist = pool
    ? minBigint(positionExposureMist, maxNewCover)
    : positionExposureMist;
  const positionCoverCapped =
    !!pool && positionExposureMist > sizedPositionCoverMist;
  const positionSizingDisabled =
    positionExposureMist <= 0n || (!!pool && sizedPositionCoverMist <= 0n);
  const naviUsdeNetUsd =
    (naviExposure?.usdeSupplyUsd ?? 0) - (naviExposure?.usdeBorrowUsd ?? 0);
  const naviTotalNetUsd =
    (naviExposure?.totalSupplyUsd ?? 0) - (naviExposure?.totalBorrowUsd ?? 0);
  const suilendUsdeNetUsd =
    (suilendExposure?.usdeSupplyUsd ?? 0) -
    (suilendExposure?.usdeBorrowUsd ?? 0);
  const suilendTotalNetUsd =
    (suilendExposure?.totalSupplyUsd ?? 0) -
    (suilendExposure?.totalBorrowUsd ?? 0);
  const naviUsdeExposureUsd = Math.max(0, naviUsdeNetUsd);
  const suilendUsdeExposureUsd = Math.max(0, suilendUsdeNetUsd);
  const naviSuggestedCoverSui =
    suiUsdPrice && naviUsdeExposureUsd > 0
      ? naviUsdeExposureUsd / suiUsdPrice.price
      : 0;
  const suilendSuggestedCoverSui =
    suiUsdPrice && suilendUsdeExposureUsd > 0
      ? suilendUsdeExposureUsd / suiUsdPrice.price
      : 0;
  const naviSuggestedCoverMist =
    naviSuggestedCoverSui > 0 ? toMist(naviSuggestedCoverSui) : 0n;
  const suilendSuggestedCoverMist =
    suilendSuggestedCoverSui > 0 ? toMist(suilendSuggestedCoverSui) : 0n;
  const naviSizedCoverMist = pool
    ? minBigint(naviSuggestedCoverMist, maxNewCover)
    : naviSuggestedCoverMist;
  const suilendSizedCoverMist = pool
    ? minBigint(suilendSuggestedCoverMist, maxNewCover)
    : suilendSuggestedCoverMist;
  const naviSuggestionCapped =
    !!pool && naviSuggestedCoverMist > naviSizedCoverMist;
  const suilendSuggestionCapped =
    !!pool && suilendSuggestedCoverMist > suilendSizedCoverMist;
  const naviCoverDisabled = naviSizedCoverMist <= 0n || !suiUsdPrice;
  const suilendCoverDisabled = suilendSizedCoverMist <= 0n || !suiUsdPrice;
  const buyDisabled =
    !account ||
    !canRead ||
    isPending ||
    coverSui <= 0 ||
    premiumMist === undefined ||
    !!pool?.paused ||
    coverExceedsLimit;
  const depositDisabled =
    !account || !canRead || isPending || depositSui <= 0 || !!pool?.paused;

  const refresh = () =>
    qc.invalidateQueries({
      predicate: (q) => /^depeg-/.test(String(q.queryKey[0])),
    });

  async function run(
    build: () => Transaction | Promise<Transaction>,
    ok: string,
  ) {
    setNotice(null);
    try {
      const transaction = await build();
      const { digest } = await sign({ transaction });
      await client.waitForTransaction({ digest });
      setNotice({ kind: "ok", text: ok, digest, network: "mainnet" });
      refresh();
    } catch (e) {
      setNotice({ kind: "err", text: (e as Error).message });
    }
  }

  const selectPosition = (position: DepegPositionObject) => {
    setSelectedPositionId(position.id);
    setPositionObjectId(position.id);
    setManualPosition(null);
    setPositionReadError("");
  };

  const loadPosition = async () => {
    const objectId = positionObjectId.trim();
    if (!objectId.startsWith("0x") || objectId.length <= 2) {
      setPositionReadError("Enter a Sui object ID.");
      return;
    }

    setReadingPosition(true);
    setPositionReadError("");
    try {
      const position = await readPositionObject(client, objectId);
      setManualPosition(position);
      setSelectedPositionId("");
    } catch (e) {
      setManualPosition(null);
      setPositionReadError((e as Error).message);
    } finally {
      setReadingPosition(false);
    }
  };

  const usePositionCover = () => {
    if (positionSizingDisabled) return;
    setCoverSui(Number(sizedPositionCoverMist) / MIST_PER_SUI);
  };

  const useNaviCover = () => {
    if (naviCoverDisabled) return;
    const nextSui = Number(naviSizedCoverMist) / MIST_PER_SUI;
    setPositionExposureSui(nextSui);
    setCoverSui(nextSui);
  };

  const useSuilendCover = () => {
    if (suilendCoverDisabled) return;
    const nextSui = Number(suilendSizedCoverMist) / MIST_PER_SUI;
    setPositionExposureSui(nextSui);
    setCoverSui(nextSui);
  };

  const deposit = () => {
    if (!account) return;
    run(
      () =>
        buildDepegDepositLpTx({
          pkg: config.pkg,
          poolId: config.poolId,
          amountMist: toMist(depositSui),
          owner: account.address,
        }),
      `Supplied ${depositSui} SUI to the depeg pool`,
    );
  };

  const buy = () => {
    if (!premiumMist || !account) return;
    run(
      () =>
        buildDepegBuyCoverTx({
          pkg: config.pkg,
          poolId: config.poolId,
          premiumMist,
          coverMist,
          expiryMs: BigInt(Date.now() + termDays * DAY_MS),
          owner: account.address,
        }),
      `Bought ${coverSui} SUI of depeg cover`,
    );
  };

  const withdraw = (shareId: string) => {
    if (!account) return;
    run(
      () =>
        buildDepegWithdrawLpTx({
          pkg: config.pkg,
          poolId: config.poolId,
          shareId,
          owner: account.address,
        }),
      "Redeemed LP share",
    );
  };

  const record = (policyId: string) =>
    run(
      () =>
        buildDepegRecordBreachTx({
          client,
          pkg: config.pkg,
          poolId: config.poolId,
          policyId,
          feedId: pool?.feedIdHex,
        }),
      "Breach observation recorded",
    );

  const claim = (policyId: string) => {
    if (!account) return;
    run(
      () =>
        buildDepegClaimLatchedTx({
          pkg: config.pkg,
          poolId: config.poolId,
          policyId,
          owner: account.address,
        }),
      "Latched policy claimed",
    );
  };

  return (
    <div className="card">
      <h3>
        Mainnet depeg actions <span className="sub">- SUI collateral</span>
      </h3>
      <p className="lead">
        Buyer, LP, keeper, and claim transactions for the Pyth-settled depeg
        pool. The verified mainnet package and production pool are prefilled;
        replace them only when rotating to a new pool.
      </p>

      <div className="row">
        <div className="field">
          <label>Package ID</label>
          <input
            className="mono"
            placeholder="0x..."
            value={pkg}
            onChange={(e) => setPkg(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Pool object ID</label>
          <input
            className="mono"
            placeholder="0x..."
            value={poolId}
            onChange={(e) => setPoolId(e.target.value)}
          />
        </div>
      </div>

      {!configured && (
        <p className="note">
          Paste a verified package and pool ID to enable the mainnet action
          builders.
        </p>
      )}
      {configured && !onMainnet && (
        <button
          className="btn ghost"
          style={{ width: "auto" }}
          onClick={() => selectNetwork(MAINNET)}
        >
          Switch app to Sui mainnet
        </button>
      )}
      {!account && (
        <div style={{ marginTop: 12 }}>
          <ConnectButton />
        </div>
      )}
      {poolError && (
        <p className="note err">
          Pool read failed: {(poolError as Error).message}
        </p>
      )}

      <div className="term-grid" style={{ marginTop: 16 }}>
        <div className="term-stat">
          <div className="k">Pool TVL</div>
          <div className="v">{pool ? sui(pool.fundsMist) : "-"}</div>
        </div>
        <div className="term-stat">
          <div className="k">Outstanding cover</div>
          <div className="v">{pool ? sui(pool.totalCoverMist) : "-"}</div>
        </div>
        <div className="term-stat">
          <div className="k">Headroom</div>
          <div className="v">{pool ? sui(underwritingHeadroom) : "-"}</div>
        </div>
        <div className="term-stat">
          <div className="k">Utilization</div>
          <div className="v">{pool ? `${utilization.toFixed(1)}%` : "-"}</div>
        </div>
        <div className="term-stat">
          <div className="k">Pool status</div>
          <div className={`v ${pool?.paused ? "val-bad" : ""}`}>
            {pool ? (pool.paused ? "Paused" : "Live") : "-"}
          </div>
        </div>
        <div className="term-stat">
          <div className="k">Depeg floor</div>
          <div className="v">
            {pool
              ? `$${thresholdUsd(
                  pool.thresholdScaled,
                  pool.expoNeg,
                  pool.expoMag,
                ).toFixed(3)}`
              : "-"}
          </div>
        </div>
      </div>

      {pool && (
        <div className="depeg-terms">
          <div className="quote">
            <span className="k">Premium curve</span>
            <span className="v">
              {bps(pool.premiumBps)} base + {bps(pool.surgePremiumBps)} surge
            </span>
          </div>
          <div className="quote">
            <span className="k">Max new cover</span>
            <span className="v">{sui(maxNewCover)}</span>
          </div>
          <div className="quote">
            <span className="k">Per-policy cap</span>
            <span className="v">
              {pool.maxCoverPerPolicyMist === 0n
                ? "uncapped"
                : sui(pool.maxCoverPerPolicyMist)}
            </span>
          </div>
          <div className="quote">
            <span className="k">Pool cover cap</span>
            <span className="v">
              {pool.maxTotalCoverMist === 0n
                ? "collateral bound"
                : sui(pool.maxTotalCoverMist)}
            </span>
          </div>
          <div className="quote">
            <span className="k">Dwell / activation</span>
            <span className="v">
              {duration(pool.minDwellSecs)} /{" "}
              {duration(pool.activationDelaySecs)}
            </span>
          </div>
          <div className="quote">
            <span className="k">Oracle confidence / age</span>
            <span className="v">
              {pool.maxConfBps} bps / {duration(pool.maxAgeSecs)}
            </span>
          </div>
          <div className="quote">
            <span className="k">Treasury fee</span>
            <span className="v">{bps(pool.treasuryFeeBps)} of premium</span>
          </div>
          <div className="quote">
            <span className="k">Keeper bounty</span>
            <span className="v">{sui(pool.keeperBountyMist)}</span>
          </div>
        </div>
      )}

      {pool?.paused && (
        <p className="note err">
          New deposits and cover purchases are paused. Record-breach, claim,
          expiry, and withdrawal paths stay available by contract design.
        </p>
      )}

      <div className="depeg-position-panel">
        <div className="depeg-position-head">
          <div>
            <h4>
              Protect this position{" "}
              <span className="sub">- NAVI / Suilend</span>
            </h4>
            <p className="muted">
              NAVI and Suilend feeds can prefill cover sizing. Manual object
              import stays available for review and unsupported positions.
            </p>
          </div>
          {account && onMainnet && (
            <div className="depeg-position-head-actions">
              <button
                className="btn ghost"
                disabled={loadingNaviExposure}
                onClick={() => void refetchNaviExposure()}
              >
                {loadingNaviExposure ? "Loading NAVI..." : "Refresh NAVI"}
              </button>
              <button
                className="btn ghost"
                disabled={loadingSuilendExposure}
                onClick={() => void refetchSuilendExposure()}
              >
                {loadingSuilendExposure
                  ? "Loading Suilend..."
                  : "Refresh Suilend"}
              </button>
              <button
                className="btn ghost"
                disabled={scanningPositions}
                onClick={() => void refetchPositions()}
              >
                {scanningPositions ? "Scanning..." : "Rescan objects"}
              </button>
            </div>
          )}
        </div>

        {!account && (
          <p className="muted">Connect a wallet to scan lending positions.</p>
        )}
        {account && !onMainnet && (
          <button
            className="btn ghost"
            style={{ width: "auto" }}
            onClick={() => selectNetwork(MAINNET)}
          >
            Switch app to Sui mainnet
          </button>
        )}
        {account && onMainnet && (
          <>
            <div className="depeg-position-list">
              {positionCandidates.slice(0, 5).map((position) => (
                <button
                  className={`depeg-position-row ${
                    position.id === selectedPositionId ? "selected" : ""
                  }`}
                  key={position.id}
                  onClick={() => selectPosition(position)}
                >
                  <span>
                    <strong>{position.label}</strong>
                    <span className="muted mono">{position.id}</span>
                  </span>
                  <span className="pill">{position.protocol}</span>
                </button>
              ))}
            </div>
            {positionCandidates.length === 0 && !scanningPositions && (
              <p className="muted">
                No NAVI or Suilend-like objects found in this wallet.
              </p>
            )}
            {positionError && (
              <p className="note err">
                Position scan failed: {(positionError as Error).message}
              </p>
            )}
          </>
        )}

        {account && onMainnet && naviExposure && (
          <div className="depeg-navi-box">
            <div className="term-grid">
              <div className="term-stat">
                <div className="k">NAVI USDe-family net</div>
                <div className="v">{dollars(naviUsdeNetUsd)}</div>
              </div>
              <div className="term-stat">
                <div className="k">USDe supply</div>
                <div className="v">{dollars(naviExposure.usdeSupplyUsd)}</div>
              </div>
              <div className="term-stat">
                <div className="k">USDe borrow</div>
                <div className="v">{dollars(naviExposure.usdeBorrowUsd)}</div>
              </div>
              <div className="term-stat">
                <div className="k">All NAVI net</div>
                <div className="v">{dollars(naviTotalNetUsd)}</div>
              </div>
              <div className="term-stat">
                <div className="k">SUI/USD</div>
                <div className="v">
                  {suiUsdPrice ? dollars(suiUsdPrice.price) : "-"}
                </div>
              </div>
              <div className="term-stat">
                <div className="k">Suggested cover</div>
                <div className="v">
                  {naviSizedCoverMist > 0n ? sui(naviSizedCoverMist) : "-"}
                </div>
              </div>
            </div>
            {naviExposure.usdeLines.length > 0 ? (
              <div className="depeg-navi-lines">
                {naviExposure.usdeLines.slice(0, 4).map((line) => (
                  <div className="depeg-navi-line" key={line.id}>
                    <span>
                      {line.symbol}{" "}
                      <span className="muted">
                        {line.side} / {line.market}
                      </span>
                    </span>
                    <span className="mono">{dollars(line.valueUsd)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">
                NAVI returned no USDe-family supply or borrow lines for this
                wallet.
              </p>
            )}
            <p className="note">
              NAVI values are parsed from `@naviprotocol/lending`; SUI
              conversion reads Pyth's SUI/USD PriceInfoObject.
            </p>
            <button
              className="btn"
              style={{ width: "auto" }}
              disabled={naviCoverDisabled || loadingSuiUsd}
              onClick={useNaviCover}
            >
              {loadingSuiUsd ? "Reading SUI/USD..." : "Use NAVI USDe exposure"}
            </button>
            {naviSuggestionCapped && (
              <p className="note">
                NAVI exposure was capped by current pool headroom and per-policy
                limits.
              </p>
            )}
          </div>
        )}
        {account && onMainnet && suilendExposure && (
          <div className="depeg-navi-box">
            <div className="term-grid">
              <div className="term-stat">
                <div className="k">Suilend USDe-family net</div>
                <div className="v">{dollars(suilendUsdeNetUsd)}</div>
              </div>
              <div className="term-stat">
                <div className="k">USDe supply</div>
                <div className="v">
                  {dollars(suilendExposure.usdeSupplyUsd)}
                </div>
              </div>
              <div className="term-stat">
                <div className="k">USDe borrow</div>
                <div className="v">
                  {dollars(suilendExposure.usdeBorrowUsd)}
                </div>
              </div>
              <div className="term-stat">
                <div className="k">All Suilend net</div>
                <div className="v">{dollars(suilendTotalNetUsd)}</div>
              </div>
              <div className="term-stat">
                <div className="k">Owner caps</div>
                <div className="v">{suilendExposure.ownerCapCount}</div>
              </div>
              <div className="term-stat">
                <div className="k">Suggested cover</div>
                <div className="v">
                  {suilendSizedCoverMist > 0n
                    ? sui(suilendSizedCoverMist)
                    : "-"}
                </div>
              </div>
            </div>
            {suilendExposure.usdeLines.length > 0 ? (
              <div className="depeg-navi-lines">
                {suilendExposure.usdeLines.slice(0, 4).map((line) => (
                  <div className="depeg-navi-line" key={line.id}>
                    <span>
                      {line.symbol}{" "}
                      <span className="muted">{line.side} / main pool</span>
                    </span>
                    <span className="mono">{dollars(line.valueUsd)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">
                Suilend returned no USDe-family supply or borrow lines for this
                wallet.
              </p>
            )}
            <p className="note">
              Suilend values are read from wallet owner caps and main-pool
              obligation market values; SUI conversion uses Pyth SUI/USD.
            </p>
            <button
              className="btn"
              style={{ width: "auto" }}
              disabled={suilendCoverDisabled || loadingSuiUsd}
              onClick={useSuilendCover}
            >
              {loadingSuiUsd
                ? "Reading SUI/USD..."
                : "Use Suilend USDe exposure"}
            </button>
            {suilendSuggestionCapped && (
              <p className="note">
                Suilend exposure was capped by current pool headroom and
                per-policy limits.
              </p>
            )}
          </div>
        )}
        {suiUsdError && (
          <p className="note err">
            SUI/USD read failed: {(suiUsdError as Error).message}
          </p>
        )}
        {naviExposureError && (
          <p className="note err">
            NAVI exposure read failed: {(naviExposureError as Error).message}
          </p>
        )}
        {suilendExposureError && (
          <p className="note err">
            Suilend exposure read failed:{" "}
            {(suilendExposureError as Error).message}
          </p>
        )}

        <div className="row">
          <div className="field">
            <label>Position object ID</label>
            <input
              className="mono"
              placeholder="0x..."
              value={positionObjectId}
              onChange={(e) => {
                setPositionObjectId(e.target.value);
                setSelectedPositionId("");
                setManualPosition(null);
                setPositionReadError("");
              }}
            />
          </div>
          <div className="field">
            <label>Exposure to cover (SUI)</label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={positionExposureSui}
              onChange={(e) => setPositionExposureSui(+e.target.value)}
            />
          </div>
        </div>

        <div className="depeg-position-actions">
          <button
            className="btn ghost"
            disabled={!onMainnet || readingPosition || !positionObjectId.trim()}
            onClick={() => void loadPosition()}
          >
            {readingPosition ? "Loading..." : "Load object"}
          </button>
          <button
            className="btn"
            disabled={positionSizingDisabled}
            onClick={usePositionCover}
          >
            Use as cover size
          </button>
        </div>
        {positionReadError && <p className="note err">{positionReadError}</p>}

        <div className="depeg-position-summary">
          <div className="quote">
            <span className="k">Imported object</span>
            <span className="v">{importedPosition?.label ?? "-"}</span>
          </div>
          <div className="quote">
            <span className="k">Object type</span>
            <span className="v">{importedPosition?.type ?? "-"}</span>
          </div>
          <div className="quote">
            <span className="k">Detected fields</span>
            <span className="v">
              {importedPosition
                ? importedPosition.fieldKeys.slice(0, 5).join(", ") || "-"
                : "-"}
            </span>
          </div>
          <div className="quote">
            <span className="k">Cover size</span>
            <span className="v">
              {positionExposureMist > 0n ? sui(sizedPositionCoverMist) : "-"}
            </span>
          </div>
        </div>
        {positionCoverCapped && (
          <p className="note">
            Cover size is capped by current pool headroom and per-policy limits.
          </p>
        )}
      </div>

      <div className="row">
        <div className="field">
          <label>Provide liquidity (SUI)</label>
          <input
            type="number"
            min={0}
            step={0.01}
            value={depositSui}
            onChange={(e) => setDepositSui(+e.target.value)}
          />
          <button className="btn" disabled={depositDisabled} onClick={deposit}>
            {isPending ? "Working..." : "Deposit & underwrite"}
          </button>
        </div>
        <div className="field">
          <label>Buy cover (SUI payout)</label>
          <input
            type="number"
            min={0}
            step={0.01}
            value={coverSui}
            onChange={(e) => setCoverSui(+e.target.value)}
          />
          <select
            value={termDays}
            onChange={(e) => setTermDays(+e.target.value)}
          >
            {COVER_TERMS.map((term) => (
              <option key={term} value={term}>
                {term}d
              </option>
            ))}
          </select>
          <div className="quote">
            <span className="k">Premium</span>
            <span className="v">
              {premiumMist !== undefined ? sui(premiumMist) : "-"}
            </span>
          </div>
          {pool && (
            <div className="quote">
              <span className="k">Available for this buy</span>
              <span className="v">{sui(maxNewCover)}</span>
            </div>
          )}
          {coverExceedsLimit && (
            <p className="note err">
              Requested cover exceeds current headroom or per-policy caps.
            </p>
          )}
          <button className="btn" disabled={buyDisabled} onClick={buy}>
            {isPending ? "Working..." : "Buy depeg cover"}
          </button>
        </div>
      </div>

      {notice && <Notice {...notice} />}

      <h4 style={{ margin: "18px 0 6px" }}>My depeg positions</h4>
      <p className="muted" style={{ marginTop: 0 }}>
        LP shares: {shareUnits(totalShareUnits)}
      </p>
      {mine?.shares.map((share) => (
        <div className="policy" key={share.id}>
          <div>
            <div>{shareUnits(share.shares)}</div>
            <div className="muted mono">{share.id}</div>
          </div>
          <button
            className="btn"
            style={{ width: "auto", marginTop: 0 }}
            disabled={!account || !canRead || isPending}
            onClick={() => withdraw(share.id)}
          >
            Withdraw
          </button>
        </div>
      ))}
      {mine && mine.policies.length === 0 && (
        <p className="muted">No depeg policies yet.</p>
      )}
      {mine?.policies.map((policy) => {
        const now = Date.now();
        const expired = now > policy.expiryMs;
        const active = now >= policy.activationMs && !expired;
        const dwellMs = (pool?.minDwellSecs ?? 0) * 1000;
        const dwellReadyMs = policy.firstBreachMs + dwellMs;
        const dwellRemainingMs = policy.armed ? dwellReadyMs - now : 0;
        const dwellProgress =
          policy.armed && dwellMs > 0
            ? Math.max(
                0,
                Math.min(100, ((now - policy.firstBreachMs) / dwellMs) * 100),
              )
            : 0;
        const canRecord =
          active &&
          !expired &&
          !policy.breached &&
          (!policy.armed || dwellRemainingMs <= 0);
        const status = policy.breached
          ? "Latched"
          : expired
            ? "Expired"
            : policy.armed
              ? "Dwell armed"
              : active
                ? "Active"
                : "Activating";
        return (
          <div className="policy" key={policy.id}>
            <div>
              <div>
                {sui(policy.coverMist)} cover{" "}
                <span className={`pill ${policy.breached ? "active" : ""}`}>
                  {status}
                </span>
              </div>
              <div className="muted">
                premium {sui(policy.premiumPaidMist)} - active{" "}
                {compactDate(policy.activationMs)} - expires{" "}
                {compactDate(policy.expiryMs)}
              </div>
              <div className="muted">
                {policy.breached
                  ? `latched at breach price ${policy.breachPrice.toString()}`
                  : policy.armed
                    ? `dwell ${
                        dwellRemainingMs <= 0
                          ? "ready to confirm"
                          : `${remaining(dwellRemainingMs)} remaining`
                      }`
                    : active
                      ? "eligible to arm if Pyth stays below the floor"
                      : `activation ${remaining(policy.activationMs - now)}`}
              </div>
              {policy.armed && !policy.breached && (
                <div className="depeg-progress" aria-label="Dwell progress">
                  <span style={{ width: `${dwellProgress}%` }} />
                </div>
              )}
              <div className="muted mono">{policy.id}</div>
            </div>
            <div className="depeg-policy-actions">
              <button
                className="btn ghost"
                disabled={!account || !canRead || isPending || !canRecord}
                onClick={() => record(policy.id)}
              >
                {policy.armed
                  ? dwellRemainingMs <= 0
                    ? "Confirm dwell"
                    : `Dwell ${remaining(dwellRemainingMs)}`
                  : "Record breach"}
              </button>
              <button
                className="btn"
                disabled={!account || !canRead || isPending || !policy.breached}
                onClick={() => claim(policy.id)}
              >
                Claim
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
