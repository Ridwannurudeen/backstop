import { chromium, devices } from "playwright";

const baseUrl = process.env.DEPEG_SMOKE_URL ?? "http://127.0.0.1:5173/depeg";
const proofUrl =
  process.env.PROOF_SMOKE_URL ??
  (baseUrl.endsWith("/depeg")
    ? baseUrl.replace(/\/depeg$/, "/proof")
    : baseUrl);
const requiredHeadings = [
  /Depeg cover simulator/i,
  /Mainnet cover desk/i,
  /Mainnet proof health/i,
  /^Depeg cover/i,
];

async function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const isAllowedConsoleError = (text) =>
  /Failed to load resource: net::ERR_NAME_NOT_RESOLVED/.test(text);

async function checkPage(browser, name, options) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.goto(baseUrl, { waitUntil: "commit", timeout: 60_000 });
  for (const heading of requiredHeadings) {
    await page.getByRole("heading", { name: heading }).first().waitFor({
      state: "visible",
      timeout: 60_000,
    });
  }

  const ids = await page
    .locator(".card", { hasText: "Mainnet cover desk" })
    .locator("input.mono")
    .evaluateAll((inputs) =>
      inputs.map((input) =>
        input instanceof HTMLInputElement ? input.value : "",
      ),
    );
  const defaultIds = ids.slice(0, 2);
  assert(defaultIds.length === 2, `${name}: expected package and pool inputs`);
  assert(
    defaultIds.every((value) => value.startsWith("0x") && value.length > 40),
    `${name}: default depeg ids were not prefilled`,
  );

  await page.waitForFunction(
    () => {
      const card = Array.from(document.querySelectorAll(".card")).find((node) =>
        node.textContent?.includes("Mainnet cover desk"),
      );
      if (!card) return false;
      const stats = Array.from(card.querySelectorAll(".term-stat"));
      const poolTvl = stats.find((node) =>
        node.textContent?.includes("Pool TVL"),
      );
      const poolValue = poolTvl?.querySelector(".v")?.textContent?.trim();
      const quotes = Array.from(card.querySelectorAll(".quote"));
      const premium = quotes.find((node) =>
        node.textContent?.includes("Premium"),
      );
      const premiumValue = premium?.querySelector(".v")?.textContent?.trim();
      return (
        poolValue != null &&
        poolValue !== "-" &&
        premiumValue != null &&
        premiumValue !== "-"
      );
    },
    undefined,
    { timeout: 45_000 },
  );

  await page.locator(".proof-health-row").first().waitFor({
    state: "visible",
    timeout: 45_000,
  });
  const proofRows = await page.locator(".proof-health-row").count();
  assert(proofRows >= 8, `${name}: proof-health rows did not render`);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  assert(!overflow, `${name}: horizontal overflow detected`);
  const initialActionableErrors = consoleErrors.filter(
    (message) => !isAllowedConsoleError(message),
  );
  assert(
    initialActionableErrors.length === 0,
    `${name}: console errors: ${initialActionableErrors.join(" | ")}`,
  );

  await page.goto(proofUrl, { waitUntil: "commit", timeout: 60_000 });
  await page
    .getByRole("heading", { name: /Every load-bearing claim/i })
    .waitFor({
      state: "visible",
      timeout: 60_000,
    });
  await page.getByRole("heading", { name: /Verifier status/i }).waitFor({
    state: "visible",
    timeout: 60_000,
  });
  await page
    .getByRole("heading", { name: /Protocol integration snippets/i })
    .waitFor({
      state: "visible",
      timeout: 60_000,
    });
  await page.locator(".proof-object-list code").first().waitFor({
    state: "visible",
    timeout: 45_000,
  });
  const proofCodeBlocks = await page.locator(".proof-snippets pre").count();
  assert(proofCodeBlocks >= 4, `${name}: SDK snippets did not render`);
  const proofOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  assert(!proofOverflow, `${name}: proof page horizontal overflow detected`);
  const actionableErrors = consoleErrors.filter(
    (message) => !isAllowedConsoleError(message),
  );
  assert(
    actionableErrors.length === 0,
    `${name}: console errors: ${actionableErrors.join(" | ")}`,
  );

  await context.close();
  console.log(`ok /depeg + /proof ${name} smoke`);
}

async function launchBrowser() {
  try {
    return await chromium.launch();
  } catch (error) {
    if (
      error instanceof Error &&
      /Executable doesn't exist/.test(error.message)
    ) {
      return chromium.launch({ channel: "chrome" });
    }
    throw error;
  }
}

const browser = await launchBrowser();
try {
  await checkPage(browser, "desktop", {
    viewport: { width: 1366, height: 900 },
  });
  await checkPage(browser, "mobile", devices["iPhone 13"]);
} finally {
  await browser.close();
}
