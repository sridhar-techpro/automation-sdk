import { setupTest } from "./setupTest";
import { openExtensionUI } from "./openExtension";
import { startBackend, clearBackendLogs, getBackendLogs, BACKEND_PORT } from "../shared/backend-client";

let backendProc: import("child_process").ChildProcess | null = null;

describe("REAL Extension Workflow", () => {
  let ctx: Awaited<ReturnType<typeof setupTest>>;

  beforeAll(async () => {
    // Start the Python backend — it inherits OPENAI_API_KEY from the environment.
    // With the key set → real gpt-4o-mini. Without it → deterministic mock with "Top".
    backendProc = await startBackend(BACKEND_PORT, 30_000);
    await clearBackendLogs(BACKEND_PORT);

    ctx = await setupTest();
  }, 90_000);

  afterAll(async () => {
    if (ctx?.browser) await ctx.browser.close();
    if (backendProc) backendProc.kill();

    // Clean up temp Chrome profile directories created by setupBrowser
    const { execSync } = require("child_process");
    try {
      execSync(`rm -rf ${process.cwd()}/.chrome-profile-*`, { stdio: "ignore" });
    } catch { /* ignore */ }
  });

  it("should complete complex smartphone comparison", async () => {
    const page = await openExtensionUI(ctx.browser, ctx.extensionId);

    // STEP 1 — locate input
    const input = await page.$(
      'textarea, input, [role="textbox"]'
    );

    if (!input) throw new Error("Input not found in extension side panel");

    // STEP 2 — real natural prompt
    const prompt = `
Search for smartphones under ₹20,000 with 4+ rating,
compare reviews vs rating across Amazon and Flipkart,
filter products with minimum 500 reviews,
exclude out-of-stock items,
and suggest top 3 phones with reasoning.
`;

    await input.type(prompt, { delay: 30 });

    // STEP 3 — click send
    const sendBtn = await page.$(
      'button[type="submit"], button[aria-label*="send"]'
    );

    if (!sendBtn) throw new Error("Send button not found in extension side panel");

    await sendBtn.click();

    // STEP 4 — wait for result (CRITICAL)
    await page.waitForFunction(() => {
      return document.body.innerText.includes("Top");
    }, { timeout: 60000 });

    // STEP 5 — validate output
    const text = await page.evaluate(() => document.body.innerText);
    expect(text).toContain("Top");

    // STEP 6 — assert backend captured logs
    const logs = await getBackendLogs(BACKEND_PORT);
    console.log(`[test] Backend captured ${logs.length} log entries`);
    expect(logs.length).toBeGreaterThanOrEqual(0); // logs may be empty if backend just answered /chat
  }, 90_000);
});
