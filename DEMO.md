# Backstop Demo

Use `DEMO_SCRIPT.md` for the 2-4 minute recording. This file is the short
operator version.

## Demo path

1. Open `https://backstop.gudman.xyz/submission`.
2. State the thesis: Backstop is the DeepBook-priced cover desk for Sui DeFi.
3. Open `https://backstop.gudman.xyz/proof`.
4. Show mainnet package, pool, policy, lifecycle replay, and keeper dry-run
   monitor.
5. Open `https://backstop.gudman.xyz/depeg`.
6. Show no-wallet quote, live Pyth price, pool capital, premium, and payout.
7. If using a wallet, buy only a tiny mainnet policy.
8. Open `https://backstop.gudman.xyz/protocol`.
9. Show quote, buy, record breach, claim, adapter, and proof API snippets.
10. Open `https://backstop.gudman.xyz/risk-index`.
11. Show SRX, keeper lanes, protocol passports, and NAVI/Suilend adapter specs.

## Spoken close

Backstop makes Sui risk inspectable, priced, and settleable. The hackathon
product is a real mainnet depeg cover lane; the long-term product is a Sui risk
clearinghouse that protocols, wallets, treasuries, and LPs can integrate.

## Live evidence

- Package:
  `0x761832702281966fac9dee6183b530d2f73ecd779524c61cd3dd4705fa6ec968`
- Pool:
  `0x5edc508a4258e1253563219049dadc8b068cf309115e29732dad71698c168592`
- Pyth price object:
  `0x9b2028bfc829127d2e5ead1691dc3002de9e9b8d8076b4915e5ecc7d9b99d63f`
- Active policy:
  `0x3863ad1bf44904af1fcc3ead38589977378e6800e14ceacebf1205187ce695ec`

## Do not overclaim

- Mainnet depeg cover is live but unaudited.
- Keeper execution is not autonomous in this checkout; `/proof` shows a public
  dry-run monitor and wallet-gated action derivation.
- NAVI and Suilend adapters are verified specs, not live production parsers.
- DeepBook Predict, RiskFeed, Walrus, and the AI underwriter are research lanes
  until connected to production pool capacity.
