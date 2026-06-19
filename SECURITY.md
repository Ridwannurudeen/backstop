# Security

Backstop is not yet production-safe insurance. Treat the current mainnet pool as
an experimental, low-cap deployment until it is independently reviewed and
operated with external users.

## Current Status

- Mainnet v4 is deployed as a tiny corrected pool with active cover.
- Mainnet v3 remains archived as mechanism-test evidence.
- No independent Move security review has been completed.
- No public bug bounty is active.
- Do not raise pool caps or market the deployment as production-safe before an
  external Move review and real integration validation.

## Reporting

Open a private GitHub security advisory or contact the repository owner directly
for suspected vulnerabilities. Do not disclose exploitable details publicly until
the issue is fixed or otherwise mitigated.

## Required Before Higher Caps

- Independent Move review of `contracts/pyth_cover_pool`.
- Confirmation that all deployment IDs in `DEPLOYMENTS.md` match the intended
  package and pool.
- Keeper runbook for breach, recovery, expiry sweeping, and oracle downtime.
- Monitoring for oracle age, confidence, epoch state, pool solvency, governance
  proposals, and keeper inactivity.
- Connected-wallet smoke test against the corrected package.
- Stable-collateral or haircut design before protecting USD-denominated losses
  with meaningful size.
