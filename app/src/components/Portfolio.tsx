import { useState } from "react";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import { useQuery } from "@tanstack/react-query";
import {
  buildDepegClaimLatchedTx,
  buildDepegExpirePolicyByIdTx,
} from "@gudman/backstop-sdk";
import { objectUrl } from "../lib/format";
import { MAINNET_DEPEG_PROOF_PACK } from "../lib/proofData";
import { Notice, type NoticeState } from "./Notice";

type OwnedPolicy = {
  objectId: string;
  type: string;
  fields: Record<string, unknown>;
};

async function fetchOwnedPolicies(
  client: ReturnType<typeof useSuiClient>,
  owner: string,
  packageId: string,
) {
  const response = await client.getOwnedObjects({
    owner,
    limit: 50,
    options: { showType: true, showContent: true },
  });

  return response.data
    .map((item): OwnedPolicy | null => {
      const data = item.data;
      const type = data?.type;
      const content = data?.content;
      if (
        !data ||
        !type ||
        !type.includes(packageId) ||
        !type.includes("::pyth_cover_pool::Policy") ||
        !content ||
        content.dataType !== "moveObject"
      ) {
        return null;
      }

      return {
        objectId: data.objectId,
        type,
        fields: content.fields as Record<string, unknown>,
      };
    })
    .filter((policy): policy is OwnedPolicy => policy !== null);
}

function fieldValue(fields: Record<string, unknown>, names: string[]) {
  for (const name of names) {
    const value = fields[name];
    if (value !== undefined && value !== null) return String(value);
  }
  return "-";
}

export default function Portfolio() {
  const account = useCurrentAccount()!;
  const client = useSuiClient();
  const { mutateAsync: sign, isPending } = useSignAndExecuteTransaction();
  const depeg = MAINNET_DEPEG_PROOF_PACK.depegPool!;
  const [notice, setNotice] = useState<NoticeState | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["mainnet-owned-depeg-policies", account.address, depeg.packageId],
    queryFn: () => fetchOwnedPolicies(client, account.address, depeg.packageId),
    refetchInterval: 15_000,
  });

  async function claim(policyId: string) {
    setNotice(null);
    try {
      const tx = buildDepegClaimLatchedTx({
        pkg: depeg.packageId,
        poolId: depeg.poolId,
        policyId,
        owner: account.address,
      });
      const { digest } = await sign({ transaction: tx });
      setNotice({ kind: "ok", text: "Claim submitted", digest });
      await refetch();
    } catch (e) {
      setNotice({ kind: "err", text: (e as Error).message });
    }
  }

  async function expire(policyId: string) {
    setNotice(null);
    try {
      const tx = buildDepegExpirePolicyByIdTx({
        pkg: depeg.packageId,
        poolId: depeg.poolId,
        policyId,
      });
      const { digest } = await sign({ transaction: tx });
      setNotice({ kind: "ok", text: "Expiry sweep submitted", digest });
      await refetch();
    } catch (e) {
      setNotice({ kind: "err", text: (e as Error).message });
    }
  }

  return (
    <div className="card">
      <h3>My mainnet policies</h3>
      <p className="muted">
        This console reads Backstop policy objects owned by the connected wallet
        and exposes the two permissioned lifecycle actions: claim a latched
        policy or sweep an expired unlatched policy.
      </p>

      {isLoading && <p className="muted">Loading policies...</p>}
      {error && <p className="note err">{(error as Error).message}</p>}
      {!isLoading && (data ?? []).length === 0 && (
        <p className="muted">No Backstop depeg policies found in this wallet.</p>
      )}

      {(data ?? []).map((policy) => (
        <div className="policy" key={policy.objectId}>
          <div>
            <div>{policy.objectId}</div>
            <div className="muted">
              cover {fieldValue(policy.fields, ["cover", "cover_mist"])} /
              expiry {fieldValue(policy.fields, ["expiry_ms", "expiry"])}
            </div>
            <a
              className="note"
              href={objectUrl(policy.objectId, "mainnet")}
              target="_blank"
              rel="noreferrer"
            >
              Open policy object
            </a>
          </div>
          <div className="policy-actions">
            <button
              className="btn"
              disabled={isPending}
              onClick={() => claim(policy.objectId)}
            >
              Claim if latched
            </button>
            <button
              className="btn btn-secondary"
              disabled={isPending}
              onClick={() => expire(policy.objectId)}
            >
              Expire if unlatched
            </button>
          </div>
        </div>
      ))}

      {notice && <Notice {...notice} />}
    </div>
  );
}
