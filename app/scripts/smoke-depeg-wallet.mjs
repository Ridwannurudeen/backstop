import { chromium } from "playwright";

const baseUrl = process.env.DEPEG_SMOKE_URL ?? "http://127.0.0.1:5173/depeg";

async function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const isAllowedConsoleError = (text) =>
  /Failed to load resource: net::ERR_NAME_NOT_RESOLVED/.test(text);

async function checkWalletGate(browser, name, options) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  const consoleErrors = [];

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.goto(baseUrl, { waitUntil: "commit", timeout: 60_000 });
  await page.getByRole("heading", { name: /Mainnet cover desk/i }).waitFor({
    state: "visible",
    timeout: 60_000,
  });

  const connectButton = page.getByRole("button", { name: /connect/i }).first();
  await connectButton.waitFor({ state: "visible", timeout: 20_000 });

  const buyButton = page.getByRole("button", { name: "Buy depeg cover" });
  const depositButton = page.getByRole("button", {
    name: "Deposit & underwrite",
  });

  await buyButton.waitFor({ state: "visible", timeout: 20_000 });
  await depositButton.waitFor({ state: "visible", timeout: 20_000 });

  await assert(
    await buyButton.isDisabled(),
    `${name}: buy action should be disabled without wallet`,
  );
  await assert(
    await depositButton.isDisabled(),
    `${name}: underwrite action should be disabled without wallet`,
  );
  await assert(
    await page.getByRole("button", { name: /load object/i }).isDisabled(),
    `${name}: wallet-position load should be blocked without wallet`,
  );
  const claimButtons = page
    .locator("button", { hasText: "Claim payout" })
    .all()
    .then(async (nodes) => nodes.length > 0 && nodes);
  const claims = await claimButtons;
  for (const claimButton of claims || []) {
    await assert(
      await claimButton.isDisabled(),
      `${name}: claim payout should not be actionable without wallet`,
    );
  }

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  await assert(!overflow, `${name}: horizontal overflow detected`);
  const actionableErrors = consoleErrors.filter(
    (message) => !isAllowedConsoleError(message),
  );
  await assert(
    actionableErrors.length === 0,
    `${name}: console errors: ${actionableErrors.join(" | ")}`,
  );

  await context.close();
  console.log(`ok /depeg wallet-gated ${name} smoke`);
}

const browser = await chromium.launch();
try {
  await checkWalletGate(browser, "desktop", {
    viewport: { width: 1366, height: 900 },
  });
} finally {
  await browser.close();
}
