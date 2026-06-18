import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = new URL("../../", import.meta.url);
const appRoot = new URL("../", import.meta.url);

async function readJson(url) {
  const raw = await readFile(url, "utf8");
  return JSON.parse(raw.replace(/^\uFEFF/, ""));
}

function markdownReport({ proof, risk, submission, deployment }) {
  return `# Backstop Risk Report

Generated: ${new Date().toISOString()}

## Positioning

${submission.oneLiner}

Primary track: ${submission.track}

## Mainnet evidence

- Package: \`${proof.mainnet.packageId}\`
- Pool: \`${proof.mainnet.poolId}\`
- Price object: \`${proof.mainnet.priceObjectId}\`
- Active policy: \`${proof.mainnet.activePolicyId}\`

## Keeper operations

Mode: ${proof.keeperOps.mode}

${proof.keeperOps.lanes.map((lane) => `- ${lane}`).join("\n")}

## Risk markets

${risk.markets
  .map((market) => `- ${market.title}: ${market.status}, SRX ${market.score}`)
  .join("\n")}

## Adapter boundary

${risk.protocolAdapters
  .map((adapter) => `- ${adapter.protocol}: ${adapter.next}`)
  .join("\n")}

## Deployment boundary

${deployment.sdkBoundary}
`;
}

async function main() {
  const proof = await readJson(new URL("public/api/proof.json", appRoot));
  const risk = await readJson(new URL("public/api/risk-index.json", appRoot));
  const buildout = await readJson(new URL("public/api/buildout.json", appRoot));
  const protocolSamples = await readJson(
    new URL("public/api/protocol-samples.json", appRoot),
  );
  const submission = await readJson(
    new URL("public/api/submission.json", appRoot),
  );
  const deployment = await readJson(new URL("deployment.json", root));
  const generated = new Date().toISOString();
  const report = {
    generated,
    proof,
    risk,
    buildout,
    protocolSamples,
    submission,
    deployment,
  };

  const publicReport = new URL("public/api/report.json", appRoot);
  const reportsDir = new URL("../reports/", appRoot);
  const reportsPath = fileURLToPath(reportsDir);
  await mkdir(reportsDir, { recursive: true });
  await writeFile(publicReport, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(
    join(reportsPath, "backstop-risk-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  await writeFile(
    join(reportsPath, "backstop-risk-report.md"),
    markdownReport({ proof, risk, submission, deployment }),
  );
  console.log(`wrote ${publicReport.pathname}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
