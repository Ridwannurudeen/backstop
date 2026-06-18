import { useCurrentAccount, useSuiClient } from "@mysten/dapp-kit";
import { useQuery } from "@tanstack/react-query";
import { WALLET_WARNING_RULES } from "../lib/riskClearinghouse";

const MIST_PER_SUI = 1_000_000_000;

function matchRule(coinType: string) {
  const upper = coinType.toUpperCase();
  return WALLET_WARNING_RULES.find((rule) =>
    rule.match
      .split(",")
      .map((part) => part.trim().toUpperCase())
      .some((part) => part && upper.includes(part)),
  );
}

function formatBalance(coinType: string, totalBalance: string) {
  if (coinType === "0x2::sui::SUI") {
    return `${(Number(totalBalance) / MIST_PER_SUI).toFixed(4)} SUI`;
  }
  return `${totalBalance} raw units`;
}

export default function WalletRiskWidget() {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["wallet-risk-balances", account?.address],
    queryFn: () => client.getAllBalances({ owner: account!.address }),
    enabled: Boolean(account),
    refetchInterval: 20_000,
  });

  if (!account) {
    return (
      <article className="wallet-risk-widget">
        <div className="eyebrow">Wallet warnings</div>
        <h3>Connect wallet to classify covered and uncovered exposure</h3>
        <p className="muted">
          The widget reads balances client-side and maps assets to Backstop risk
          lanes. No wallet state is stored by Backstop.
        </p>
        <div className="adapter-list">
          {WALLET_WARNING_RULES.map((rule) => (
            <em key={rule.id}>{rule.label}</em>
          ))}
        </div>
      </article>
    );
  }

  const balances = data ?? [];
  const warnings = balances
    .map((balance) => ({
      ...balance,
      rule: matchRule(balance.coinType),
    }))
    .filter((balance) => balance.rule);

  return (
    <article className="wallet-risk-widget">
      <div className="eyebrow">Wallet warnings</div>
      <h3>Connected exposure scan</h3>
      <p className="muted">
        Read-only balance scan for {account.address}. This is a routing widget,
        not custody or automatic cover.
      </p>

      {isLoading && <p className="muted">Loading balances...</p>}
      {error && <p className="note err">{(error as Error).message}</p>}
      {!isLoading && warnings.length === 0 && (
        <p className="muted">
          No currently matched risk lanes. The wallet may still hold unsupported
          positions that need protocol adapters.
        </p>
      )}

      {warnings.map((warning) => (
        <div className="wallet-risk-row" key={warning.coinType}>
          <div>
            <strong>{warning.rule!.label}</strong>
            <p className="muted">{warning.coinType}</p>
            <p>{warning.rule!.risk}</p>
          </div>
          <div>
            <span>{formatBalance(warning.coinType, warning.totalBalance)}</span>
            <a href={warning.rule!.route}>{warning.rule!.action}</a>
          </div>
        </div>
      ))}
    </article>
  );
}
