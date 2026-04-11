import { Browser, Page } from "puppeteer-core";

export async function openExtensionUI(
  browser: Browser,
  extensionId: string
): Promise<Page> {
  const url = `chrome-extension://${extensionId}/side-panel/index.html`;

  // page.goto() raises ERR_BLOCKED_BY_CLIENT for chrome-extension:// URLs.
  // Target.createTarget is a browser-level CDP command that opens a new tab
  // with any URL directly — it bypasses Puppeteer's navigation error wrapper.
  const browserSession = await browser.target().createCDPSession();
  const { targetId } = await browserSession.send("Target.createTarget", {
    url,
  }) as { targetId: string };
  await browserSession.detach();

  const target = await browser.waitForTarget(
    (t) => (t as any)._targetId === targetId,
    { timeout: 15_000 }
  );

  const page = await target.page();
  if (!page) throw new Error("Could not get Page from extension tab target");

  await page.waitForSelector("textarea, #goal-input", { timeout: 10_000 });
  return page;
}
