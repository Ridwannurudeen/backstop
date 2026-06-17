import { useQuery } from "@tanstack/react-query";
import { fetchProofHealth } from "../lib/proofHealth";
import "./terminal.css";

const updated = (ms?: number) =>
  ms
    ? new Date(ms).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
      })
    : "-";

export default function DepegProofHealth() {
  const { data, error, isLoading, isFetching } = useQuery({
    queryKey: ["depeg-proof-health"],
    queryFn: fetchProofHealth,
    refetchInterval: 60_000,
  });

  const okCount =
    data?.checks.filter((item) => item.status === "ok").length ?? 0;
  const total = data?.checks.length ?? 0;

  return (
    <div className="card proof-health-card">
      <div className="proof-health-head">
        <div>
          <h3>
            Mainnet proof health <span className="sub">- live reads</span>
          </h3>
          <p className="lead">
            Deployed objects, custody transfer, upgrade locks, and paid-claim
            evidence are checked directly against Sui mainnet.
          </p>
        </div>
        <div className="proof-health-score">
          <span className={total > 0 && okCount === total ? "ok" : "warn"}>
            {okCount}/{total || "-"}
          </span>
          <span>
            {isFetching ? "refreshing" : `updated ${updated(data?.updatedAt)}`}
          </span>
        </div>
      </div>

      {isLoading && <p className="muted">Reading Sui mainnet proof state...</p>}
      {error && (
        <p className="note err">
          Proof-health read failed: {(error as Error).message}
        </p>
      )}

      {data && (
        <div className="proof-health-grid">
          {data.checks.map((item) => (
            <a
              className={`proof-health-row ${item.status}`}
              href={item.href}
              key={item.label}
              target="_blank"
              rel="noreferrer"
            >
              <span>
                <strong>{item.label}</strong>
                <span className="muted">{item.detail}</span>
              </span>
              <span className="proof-health-status">{item.value}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
