// Shared navigation map — primary sections and their pages (routes).
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
    id: "markets",
    label: "Markets",
    base: "/markets",
    wallet: false,
    tabs: [
      { label: "Risk index", to: "/markets/risk-index" },
      { label: "Risk terminal", to: "/markets/risk-terminal" },
    ],
  },
  {
    id: "depeg",
    label: "Depeg cover",
    base: "/depeg",
    wallet: false,
    tabs: [{ label: "Depeg cover", to: "/depeg" }],
  },
  {
    id: "insure",
    label: "Insure",
    base: "/insure",
    wallet: true,
    tabs: [
      { label: "Buy protection", to: "/insure/buy" },
      { label: "Treasury", to: "/insure/treasury" },
      { label: "Cover pool", to: "/insure/cover" },
      { label: "My policies", to: "/insure/policies" },
    ],
  },
  {
    id: "underwrite",
    label: "Underwrite",
    base: "/underwrite",
    wallet: true,
    tabs: [{ label: "Underwrite", to: "/underwrite" }],
  },
  {
    id: "agent",
    label: "Agent",
    base: "/agent",
    wallet: false,
    tabs: [
      { label: "AI underwriter", to: "/agent/ai" },
      { label: "Accountability", to: "/agent/accountability" },
    ],
  },
];
