import { useCurrentAccount, useSuiClient } from "@mysten/dapp-kit";
import { useQuery } from "@tanstack/react-query";
import { fetchPassport, fetchCalibration } from "../lib/accountability";
import { AGENT_PASSPORT, CALIBRATION_LEDGER } from "../lib/deployment";
import { sui } from "../lib/format";
import "./terminal.css";

const ZERO = "0x" + "0".repeat(64);
const objUrl = (id: string) => `https://testnet.suivision.xyz/object/${id}`;

export default function Accountability() {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const sender = account?.address ?? ZERO;

  const { data: passport } = useQuery({
    queryKey: ["passport"],
    queryFn: () => fetchPassport(client),
    refetchInterval: 30_000,
  });
  const { data: cal } = useQuery({
    queryKey: ["calibration"],
    queryFn: () => fetchCalibration(client, sender),
    refetchInterval: 30_000,
  });

  return (
    <div className="card">
      <h3>Agent accountability — bonded identity + calibration ledger</h3>
      <p className="muted">
        Both ecosystems are betting on an agent economy with no accountability
        primitive. Backstop's underwriter has one: a{" "}
        <b>bonded on-chain passport</b> with real skin in the game, and a{" "}
        <b>public calibration ledger</b> that scores every prediction against
        the realized outcome — reputation earned and provable, not
        self-reported.
      </p>

      <h4 style={{ margin: "8px 0 6px" }}>Agent passport</h4>
      <div className="term-grid">
        <div className="term-stat">
          <div className="k">Agent</div>
          <div className="v" style={{ fontSize: 14 }}>
            {passport ? passport.name : "—"}
          </div>
        </div>
        <div className="term-stat">
          <div className="k">Bond staked</div>
          <div className="v">{passport ? sui(passport.bondMist) : "—"}</div>
        </div>
        <div className="term-stat">
          <div className="k">Decisions</div>
          <div className="v">{passport ? passport.decisions : "—"}</div>
        </div>
        <div className="term-stat">
          <div className="k">Reputation</div>
          <div className="v">
            {cal ? `${(cal.accuracyBps / 100).toFixed(0)}%` : "—"}
          </div>
        </div>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        Bond is slashable on misbehavior.{" "}
        <a
          href={objUrl(AGENT_PASSPORT)}
          target="_blank"
          rel="noreferrer"
          style={{ color: "var(--accent)", textDecoration: "none" }}
        >
          View passport on SuiVision ↗
        </a>
      </p>

      <h4 style={{ margin: "18px 0 6px" }}>Calibration ledger</h4>
      <div className="term-grid">
        <div className="term-stat">
          <div className="k">Predictions</div>
          <div className="v">{cal ? cal.total : "—"}</div>
        </div>
        <div className="term-stat">
          <div className="k">Settled</div>
          <div className="v">{cal ? cal.settled : "—"}</div>
        </div>
        <div className="term-stat">
          <div className="k">Hit accuracy</div>
          <div className="v">
            {cal ? `${(cal.accuracyBps / 100).toFixed(1)}%` : "—"}
          </div>
        </div>
        <div className="term-stat">
          <div className="k">Avg Brier</div>
          <div className="v">{cal ? cal.brierAvg : "—"}</div>
        </div>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        Each prediction is recorded then settled against the realized outcome on
        the oracle; accuracy and Brier score accrue on-chain.{" "}
        <a
          href={objUrl(CALIBRATION_LEDGER)}
          target="_blank"
          rel="noreferrer"
          style={{ color: "var(--accent)", textDecoration: "none" }}
        >
          View ledger on SuiVision ↗
        </a>
      </p>
    </div>
  );
}
