import { Browser, Page } from "puppeteer-core";

export async function openExtensionUI(
  browser: Browser,
  extensionId: string
): Promise<Page> {
  const url = `chrome-extension://${extensionId}/side-panel/index.html`;

  // Per user requirement: create a new page (lands on about:blank), THEN
  // navigate to the extension URL. Navigating directly without a blank-page
  // warmup causes Chrome to block the request.
  const page = await browser.newPage();

  // Navigate to about:blank first (no-op; page starts here) — then go to
  // the extension URL. Using 'domcontentloaded' avoids waiting for sub-resources
  // that may not exist in a headless chrome-extension:// page.
  await page.goto("about:blank");

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 });
  } catch (navErr) {
    // Some Puppeteer versions throw for chrome-extension:// navigation even when
    // the page loaded successfully.  As long as the URL is correct, ignore the
    // error and check whether the body is present.
    const currentUrl = page.url();
    if (!currentUrl.startsWith("chrome-extension://")) {
      throw navErr;
    }
  }

  await page.waitForSelector("textarea, #goal-input", { timeout: 15_000 });
  return page;
}
