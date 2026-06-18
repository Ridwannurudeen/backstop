# Backstop Risk Report

Generated: 2026-06-18T22:43:00.767Z

## Positioning

Backstop is the DeepBook-priced cover desk and risk clearinghouse for Sui DeFi.

Primary track: DeepBook specialized track

## Mainnet evidence

- Package: `0x761832702281966fac9dee6183b530d2f73ecd779524c61cd3dd4705fa6ec968`
- Pool: `0x5edc508a4258e1253563219049dadc8b068cf309115e29732dad71698c168592`
- Price object: `0x9b2028bfc829127d2e5ead1691dc3002de9e9b8d8076b4915e5ecc7d9b99d63f`
- Active policy: `0x3863ad1bf44904af1fcc3ead38589977378e6800e14ceacebf1205187ce695ec`

## Keeper operations

Mode: dry-run public reads; signed execution is wallet-gated

- pool solvency watch
- breach observation
- dwell confirmation and claim
- expiry sweep
- protocol exposure sync
- DeepBook hedge budget

## Risk markets

- suiUSDe depeg cover: mainnet-live, SRX 84
- SUI drawdown cover: integration-ready, SRX 78
- Stablecoin basket failure: integration-ready, SRX 72
- Lending collateral shock: research-lane, SRX 67
- LP tail-risk cover: research-lane, SRX 63

## Adapter boundary

- NAVI: Confirm one borrower/vault object sample and lock parser
- Suilend: Convert sample parser into consented production auto-cover flow

## Deployment boundary

Current app constants live in app/src/lib/proofData.ts. npm @gudman/backstop-sdk@0.1.0 exported deployment constants are stale until the next approved publish.
