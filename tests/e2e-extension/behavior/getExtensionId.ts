import { Browser } from "puppeteer-core";
import path from "path";
import crypto from "crypto";

const EXTENSION_DIST = path.join(process.cwd(), "extension", "dist");

/** Deterministic Chrome-compatible extension ID from the extension path. */
function computeExtensionId(extensionPath: string): string {
  const absPath = path.resolve(extensionPath);
  const hash = crypto.createHash("sha256").update(absPath).digest();
  const chars = "abcdefghijklmnop";
  let id = "";
  for (let i = 0; i < 32; i++) {
    const byteIndex = Math.floor(i / 2);
    const nibble = i % 2 === 0 ? hash[byteIndex] >> 4 : hash[byteIndex] & 0xf;
    id += chars[nibble];
  }
  return id;
}

export async function getExtensionId(browser: Browser): Promise<string> {
  // ── Strategy 1: read from service-worker target URL (most reliable) ──────
  try {
    // Give the service worker time to register
    await new Promise((r) => setTimeout(r, 1500));
    const targets = browser.targets();
    const swTarget = targets.find(
      (t) =>
        t.type() === "service_worker" &&
        t.url().startsWith("chrome-extension://")
    );
    if (swTarget) {
      const extId = new URL(swTarget.url()).hostname;
      if (extId) return extId;
    }
  } catch { /* fall through */ }

  // ── Strategy 2: chrome://extensions/ shadow DOM ───────────────────────────
  try {
    const page = await browser.newPage();
    await page.goto("chrome://extensions/", { waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 2000));

    const id = await page.evaluate(() => {
      const manager = document.querySelector("extensions-manager");
      if (!manager) throw new Error("No extensions-manager");
      const root = (manager as any).shadowRoot;
      const itemList = root.querySelector("extensions-item-list");
      if (!itemList) throw new Error("No extensions-item-list");
      const items = itemList.shadowRoot.querySelectorAll("extensions-item");
      if (!items.length) throw new Error("No extensions loaded");
      return (items[0] as any).id;
    });

    await page.close();
    return id;
  } catch { /* fall through */ }

  // ── Strategy 3: deterministic ID computed from extension path ─────────────
  return computeExtensionId(EXTENSION_DIST);
}
