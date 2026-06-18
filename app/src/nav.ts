// Shared navigation map - primary sections and their pages (routes).
export type NavTab = { label: string; to: string };
export type NavSection = {
  id: string;
  label: string;
  base: string;
  wallet: boolean;
  tabs: NavTab[];
};

export const SECTIONS: NavSection[] = [
  {
    id: "depeg",
    label: "Cover",
    base: "/depeg",
    wallet: false,
    tabs: [{ label: "Depeg cover", to: "/depeg" }],
  },
  {
    id: "proof",
    label: "Proof",
    base: "/proof",
    wallet: false,
    tabs: [{ label: "Proof packet", to: "/proof" }],
  },
  {
    id: "markets",
    label: "Risk Feed",
    base: "/markets",
    wallet: false,
    tabs: [
      { label: "Sui Risk Index", to: "/markets/risk-index" },
      { label: "Risk terminal", to: "/markets/risk-terminal" },
    ],
  },
  {
    id: "agent",
    label: "Agent Proofs",
    base: "/agent",
    wallet: false,
    tabs: [
      { label: "AI underwriter", to: "/agent/ai" },
      { label: "Accountability", to: "/agent/accountability" },
    ],
  },
  {
    id: "lab",
    label: "DeepBook Lab",
    base: "/lab",
    wallet: true,
    tabs: [
      { label: "Buy protection", to: "/lab/buy" },
      { label: "Treasury", to: "/lab/treasury" },
      { label: "My policies", to: "/lab/policies" },
      { label: "Underwrite", to: "/lab/underwrite" },
    ],
  },
];
