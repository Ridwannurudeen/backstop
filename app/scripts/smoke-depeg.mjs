import { chromium, devices } from "playwright";

const baseUrl = process.env.DEPEG_SMOKE_URL ?? "http://127.0.0.1:5173/depeg";
const requiredHeadings = [
  /Depeg cover simulator/i,
  /Mainnet depeg actions/i,
  /Mainnet proof health/i,
  /^Depeg cover/i,
];

async function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function checkPage(browser, name, options) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  for (const heading of requiredHeadings) {
    await page.getByRole("heading", { name: heading }).first().waitFor({
      state: "visible",
      timeout: 30_000,
    });
  }

  const ids = await page
    .locator(".card", { hasText: "Mainnet depeg actions" })
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

  const proofRows = await page.locator(".proof-health-row").count();
  assert(proofRows >= 8, `${name}: proof-health rows did not render`);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  assert(!overflow, `${name}: horizontal overflow detected`);
  assert(
    consoleErrors.length === 0,
    `${name}: console errors: ${consoleErrors.join(" | ")}`,
  );

  await context.close();
  console.log(`ok /depeg ${name} smoke`);
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
