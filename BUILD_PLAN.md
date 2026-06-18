# Backstop Build Plan

Prime directive: keep the mainnet cover lane real and the roadmap honest.

## Current shipped scope

- Mainnet Pyth-settled suiUSDe depeg pool.
- Cover desk: quote, buy, treasury cover, LP supply, owned policy actions.
- Proof center: package, pool, active policy lifecycle, keeper dry-run monitor.
- Protocol kit: SDK/PTB snippets and NAVI/Suilend adapter contract.
- Risk index: SRX markets, keeper lanes, protocol passports, adapter specs.
- Static public APIs for proof, submission, and risk index.

## Immediate work

1. Wallet-connected smoke.
2. Keeper signer setup.
3. Signed breach observation receipt.
4. Signed claim or expiry receipt.
5. One real NAVI or Suilend object sample.
6. First production adapter parser.
7. SDK 0.1.1 publish with current v3 constants after approval and npm OTP.

## Ambitious buildout

1. Protocol adapters.
2. Keeper reward accounting.
3. Risk-class LP vaults.
4. DeepBook hedge router.
5. Wallet risk-warning widget.
6. Transferable cover receipts.
7. Institutional proof reports.
8. Underwriter and keeper reputation.
9. Agent underwriting receipts tied to real pool capacity.

## Boundaries

- Do not claim NAVI/Suilend production integration until object-level validation
  exists.
- Do not claim an autonomous keeper in this checkout; current public ops are a
  dry-run monitor plus SDK builders.
- Do not claim a paid mainnet claim without a digest.
- Do not submit hackathon artifacts without explicit user approval.
