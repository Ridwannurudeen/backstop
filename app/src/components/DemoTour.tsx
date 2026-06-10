import { useEffect, useState } from "react";
import { txUrl } from "../lib/format";
import "./tour.css";

type TourTab = "terminal" | "ai";

type Step = {
  title: string;
  body: string;
  tab?: TourTab;
  anchor?: string;
  cta?: { label: string; href: string };
};

const STEPS: Step[] = [
  {
    title: "A live market quote",
    body: "Everything starts with a price. The terminal quotes DOWN binaries across a strike grid straight from DeepBook Predict (read-only devInspect calls), so each point on this curve is the market-implied probability that BTC finishes below that strike by expiry.",
    tab: "terminal",
    anchor: "#risk-terminal",
  },
  {
    title: "The AI underwriter decides",
    body: "An autonomous agent reads those quotes, turns them into a probability of failure, and decides per market whether to underwrite — setting its own capacity and premium.",
    tab: "ai",
    anchor: ".uw-row",
  },
  {
    title: "Every decision proven on Walrus",
    body: "No black box: each decision — inputs, rationale, outcome — is written to Walrus as tamper-evident memory. Click “Verify on Walrus ↗” on any row to read the raw record yourself.",
    tab: "ai",
    anchor: ".uw-verify",
  },
  {
    title: "Anchored on-chain: the RiskFeed",
    body: "The agent's probabilities are published to a shared RiskFeed object on Sui — a probability-of-failure oracle any contract can read, each reading linked to its Walrus proof.",
    tab: "terminal",
    anchor: "#onchain-riskfeed",
    cta: {
      label: "Readings publish tx ↗",
      href: txUrl("A6rd1ZeqexVFQsEbbkqZNhrJgVK9NRHRycsaP94Tmc9n"),
    },
  },
  {
    title: "A protocol consumes the feed",
    body: "RiskGuard is a live consumer: a GuardedTreasury whose withdraw reads the feed and aborts when crash risk exceeds its tolerance — a market-priced circuit breaker. This withdraw released funds because risk was 2.82% against a 5% tolerance.",
    cta: {
      label: "Gated withdraw tx ↗",
      href: txUrl("7eGTCiTQMsqzZNW519GRRHiv5AUWWu4uyBsuwcsjc8We"),
    },
  },
  {
    title: "Money moves on-chain",
    body: "Both sides of the market are real: the agent supplied its own recommended capacity into the Predict vault (the ⚡ links here), and a real buyer minted a $10 crash policy for a $0.29 premium.",
    tab: "ai",
    anchor: ".uw-exec",
    cta: {
      label: "Policy mint tx ↗",
      href: txUrl("G2X8UFPRjgYf76dA7FBziGg6cyUAkoepGnTuCakzCcBP"),
    },
  },
];

export default function DemoTour({
  onTab,
  onClose,
}: {
  onTab: (tab: TourTab) => void;
  onClose: () => void;
}) {
  const [i, setI] = useState(0);
  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  useEffect(() => {
    if (step.tab) onTab(step.tab);
    if (!step.anchor) return;
    // The target tab mounts and loads data async — poll briefly, then give up
    // gracefully (the narration card works without the highlight).
    let el: Element | null = null;
    let tries = 0;
    const tick = () => {
      el = document.querySelector(step.anchor!);
      if (el) {
        clearInterval(t);
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("tour-glow");
      } else if (++tries > 24) {
        clearInterval(t);
      }
    };
    const t = setInterval(tick, 250);
    tick();
    return () => {
      clearInterval(t);
      el?.classList.remove("tour-glow");
    };
  }, [step, onTab]);

  return (
    <div className="tour-card" role="dialog" aria-label="Guided demo">
      <div className="tour-head">
        <span className="tour-count">
          {i + 1} / {STEPS.length}
        </span>
        <button className="tour-x" onClick={onClose} aria-label="Close tour">
          ✕
        </button>
      </div>
      <div className="tour-title">{step.title}</div>
      <p className="tour-body">{step.body}</p>
      {step.cta && (
        <a
          className="tour-cta"
          href={step.cta.href}
          target="_blank"
          rel="noreferrer"
        >
          {step.cta.label}
        </a>
      )}
      <div className="tour-nav">
        <button
          className="tour-btn"
          onClick={() => setI(i - 1)}
          disabled={i === 0}
        >
          Back
        </button>
        <button
          className="tour-btn primary"
          onClick={() => (last ? onClose() : setI(i + 1))}
        >
          {last ? "Done" : "Next"}
        </button>
      </div>
    </div>
  );
}
