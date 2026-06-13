import { useQuery } from "@tanstack/react-query";
import { useSuiClient } from "@mysten/dapp-kit";
import { fetchSrx } from "../lib/srx";
import { fetchDepeg } from "../lib/depeg";
import { SRX_MARKET } from "../lib/deployment";

// A live, on-chain proof strip for the landing — Backstop's whole thesis is that
// the risk data is real and verifiable, so the landing leads with live numbers.
export default function LiveStats() {
  const client = useSuiClient();
  const srx = useQuery({
    queryKey: ["srx", SRX_MARKET],
    queryFn: () => fetchSrx(client),
    refetchInterval: 30_000,
  });
  const depeg = useQuery({
    queryKey: ["depeg"],
    queryFn: fetchDepeg,
    refetchInterval: 30_000,
  });
  const suiusde = depeg.data?.find((d) => d.flagship) ?? depeg.data?.[0];

  const stats = [
    {
      v: srx.data ? `${(srx.data.crashBps / 100).toFixed(2)}%` : "—",
      l: "SRX-CRASH · live P(20% BTC drop)",
    },
    {
      v: suiusde ? `$${suiusde.price.toFixed(4)}` : "—",
      l: "suiUSDe · live Pyth peg",
    },
    { v: "9", l: "Move contracts on-chain" },
    { v: "Walrus", l: "every reading proven" },
  ];

  return (
    <div className="livestats">
      {stats.map((s, i) => (
        <div className="ls" key={i}>
          <div className="ls-v">{s.v}</div>
          <div className="ls-l">{s.l}</div>
        </div>
      ))}
    </div>
  );
}
