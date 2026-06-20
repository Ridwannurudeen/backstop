# Backstop Protocol Outreach Pack

Use this as a source for DMs, emails, and partner calls. Do not send anything
externally without explicit user approval.

## One-liner

Backstop gives Sui lending protocols a mainnet, Pyth-settled depeg-cover pool
they can use to protect USDe-family exposure before bad debt reaches emergency
governance.

## Proof Link

- App: `https://backstop.gudman.xyz/depeg`
- Proof packet: `https://backstop.gudman.xyz/proof`
- Integration guide: `INTEGRATION.md`

## Why It Matters

- Sui has already seen emergency intervention become the backstop of last resort.
- Stablecoin depeg risk is objective enough to settle on-chain.
- Protocol-native cover is stickier than retail discretionary cover.
- Backstop v6 is live on mainnet with fresh Pyth sale checks, duration pricing,
  max terms, bounded governance, permissionless expiry cleanup, DEP_ONLY upgrade
  locks, custody transfer evidence, active cover, and archived staged
  mechanism-test evidence.

## Honest Limits

- The staged 1.05 proof claim is a mechanism test, not a real depeg event.
- The production pool is conservatively capitalized and should not be treated as
  large-scale insurance yet.
- SUI-denominated payout creates USD/SUI basis risk.
- External audit is still needed before raising caps.
- The DeepBook/RiskFeed/accountability lanes are research/testnet surfaces today,
  not the production settlement path.

## Ask For A Protocol

Recommended ask:

> Let us wire a read-only exposure scan plus an optional "buy depeg cover" action
> for one USDe-family lending position. No protocol funds are needed for the
> first integration; we want one real position-holder path and feedback on the
> PTB shape.

## DM Draft

Backstop now has a live Sui mainnet depeg-cover pool for suiUSDe exposure:
Pyth-settled, fully collateralized in SUI, duration-priced, with upgrade locks
and custody evidence.

The useful integration for a lending protocol is simple: read a user's USDe
family exposure, quote cover from the pool, and let the user buy a policy from
the same app flow. If a sustained depeg happens, a keeper records the Pyth dwell
and the policy can claim from the pool.

Proof packet: https://backstop.gudman.xyz/proof
Integration guide: INTEGRATION.md

Would you be open to a small integration pass for one real position-holder path?

## Call Agenda

1. Show `/proof`: package, pool, custody, upgrade lock, production active cover,
   and archived staged claim evidence.
2. Show `/depeg`: quote, position sizing, buy flow, policy state.
3. Walk through `INTEGRATION.md`: quote, buy, record, claim.
4. Ask for one real position-holder or one protocol-owned test path.
5. Agree on cap/risk limits before any public announcement.
