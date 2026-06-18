import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import {
  PYTH_ADMIN_CUSTODY_OWNER,
  PYTH_ADMIN_CUSTODY_TX,
  PYTH_COVER_UPGRADE_CAP,
  PYTH_COVER_UPGRADE_LOCK_TX,
  PYTH_DEPEG_COVER_PKG,
  PYTH_DEPEG_POOL,
  PYTH_LENDING_PKG,
  PYTH_LENDING_UPGRADE_CAP,
  PYTH_LENDING_UPGRADE_LOCK_TX,
  PYTH_PRODUCTION_ADMIN_CAP,
  PYTH_PRODUCTION_INSURE_TX,
  PYTH_STAGED_ADMIN_CAP,
  PYTH_STAGED_CLAIM_TX,
} from "./deployment";
import { readDepegPool } from "./depegPool";
import { sui } from "./format";

const mainnet = new SuiClient({ url: getFullnodeUrl("mainnet") });
const DEP_ONLY_POLICY = 192;
const SUIVISION = "https://suivision.xyz";

export type ProofHealthStatus = "ok" | "warn" | "bad";

export type ProofHealthCheck = {
  label: string;
  value: string;
  detail: string;
  status: ProofHealthStatus;
  href?: string;
};

export type ProofHealth = {
  updatedAt: number;
  checks: ProofHealthCheck[];
};

type ObjectFields = Record<string, unknown>;
type Owner = { AddressOwner?: string };

const objectUrl = (id: string) => `${SUIVISION}/object/${id}`;
const txUrl = (digest: string) => `${SUIVISION}/txblock/${digest}`;

const fieldsOf = (content: unknown): ObjectFields => {
  if (!content || typeof content !== "object") return {};
  const fields = (content as { fields?: unknown }).fields;
  return fields && typeof fields === "object" ? (fields as ObjectFields) : {};
};

const ownerAddress = (owner: unknown): string => {
  if (!owner || typeof owner !== "object") return "";
  const address = (owner as Owner).AddressOwner;
  return typeof address === "string" ? address : "";
};

const short = (id: string) => `${id.slice(0, 8)}...${id.slice(-4)}`;

async function objectExists(id: string): Promise<boolean> {
  const object = await mainnet.getObject({ id, options: { showType: true } });
  return !!object.data?.objectId;
}

async function txSucceeded(digest: string): Promise<boolean> {
  const tx = await mainnet.getTransactionBlock({
    digest,
    options: { showEffects: true },
  });
  return tx.effects?.status.status === "success";
}

async function upgradePolicy(id: string): Promise<number> {
  const object = await mainnet.getObject({
    id,
    options: { showContent: true, showType: true },
  });
  return Number(fieldsOf(object.data?.content).policy);
}

async function adminOwner(id: string): Promise<string> {
  const object = await mainnet.getObject({
    id,
    options: { showOwner: true, showType: true },
  });
  return ownerAddress(object.data?.owner);
}

const check = (
  condition: boolean,
  label: string,
  okValue: string,
  badValue: string,
  detail: string,
  href?: string,
): ProofHealthCheck => ({
  label,
  value: condition ? okValue : badValue,
  detail,
  status: condition ? "ok" : "bad",
  href,
});

export async function fetchProofHealth(): Promise<ProofHealth> {
  const [
    pool,
    coverPackage,
    lendingPackage,
    coverPolicy,
    lendingPolicy,
    custodyTx,
    stagedClaimTx,
    productionInsureTx,
    productionAdminOwner,
    stagedAdminOwner,
    coverLockTx,
    lendingLockTx,
  ] = await Promise.all([
    readDepegPool(mainnet, PYTH_DEPEG_POOL),
    objectExists(PYTH_DEPEG_COVER_PKG),
    objectExists(PYTH_LENDING_PKG),
    upgradePolicy(PYTH_COVER_UPGRADE_CAP),
    upgradePolicy(PYTH_LENDING_UPGRADE_CAP),
    txSucceeded(PYTH_ADMIN_CUSTODY_TX),
    txSucceeded(PYTH_STAGED_CLAIM_TX),
    txSucceeded(PYTH_PRODUCTION_INSURE_TX),
    adminOwner(PYTH_PRODUCTION_ADMIN_CAP),
    adminOwner(PYTH_STAGED_ADMIN_CAP),
    txSucceeded(PYTH_COVER_UPGRADE_LOCK_TX),
    txSucceeded(PYTH_LENDING_UPGRADE_LOCK_TX),
  ]);

  const adminCustodyOk =
    productionAdminOwner.toLowerCase() ===
      PYTH_ADMIN_CUSTODY_OWNER.toLowerCase() &&
    stagedAdminOwner.toLowerCase() === PYTH_ADMIN_CUSTODY_OWNER.toLowerCase();
  const headroom =
    pool.fundsMist > pool.totalCoverMist
      ? pool.fundsMist - pool.totalCoverMist
      : 0n;

  return {
    updatedAt: Date.now(),
    checks: [
      check(
        coverPackage && lendingPackage,
        "Packages",
        "Published",
        "Missing",
        "cover + lending packages resolve on Sui mainnet",
        objectUrl(PYTH_DEPEG_COVER_PKG),
      ),
      check(
        !pool.paused && pool.fundsMist > 0n,
        "Production pool",
        "Live",
        pool.paused ? "Paused" : "Empty",
        `${sui(pool.fundsMist)} TVL, ${sui(headroom)} headroom`,
        objectUrl(PYTH_DEPEG_POOL),
      ),
      check(
        coverPolicy === DEP_ONLY_POLICY && lendingPolicy === DEP_ONLY_POLICY,
        "Upgrade policy",
        "DEP_ONLY",
        "Mutable",
        "cover + lending UpgradeCaps are dependency-only",
        objectUrl(PYTH_COVER_UPGRADE_CAP),
      ),
      check(
        coverLockTx && lendingLockTx,
        "Policy lock txs",
        "Verified",
        "Missing",
        "both upgrade-policy lock transactions succeeded",
        txUrl(PYTH_COVER_UPGRADE_LOCK_TX),
      ),
      check(
        adminCustodyOk,
        "Admin custody",
        "Transferred",
        "Mismatch",
        `owner ${short(PYTH_ADMIN_CUSTODY_OWNER)}`,
        txUrl(PYTH_ADMIN_CUSTODY_TX),
      ),
      check(
        custodyTx,
        "Custody tx",
        "Success",
        "Failed",
        "production + staged AdminCaps moved together",
        txUrl(PYTH_ADMIN_CUSTODY_TX),
      ),
      check(
        stagedClaimTx,
        "Staged claim",
        "Paid",
        "Missing",
        "staged buy -> dwell -> claim proof paid on mainnet",
        txUrl(PYTH_STAGED_CLAIM_TX),
      ),
      check(
        productionInsureTx && pool.totalCoverMist > 0n,
        "Production cover",
        sui(pool.totalCoverMist),
        "Missing",
        "production-shaped pool has outstanding cover and retained premium while suiUSDe stayed above floor",
        txUrl(PYTH_PRODUCTION_INSURE_TX),
      ),
    ],
  };
}
