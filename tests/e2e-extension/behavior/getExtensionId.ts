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
  // ── Strategy 1: find service-worker or background target for OUR extension ─
  // Give Chrome a few seconds to register the extension service worker.
  for (let attempt = 0; attempt < 5; attempt++) {
    await new Promise((r) => setTimeout(r, 1000));
    const targets = browser.targets();
    const extTarget = targets.find(
      (t) =>
        (t.type() === "service_worker" || t.type() === "background_page") &&
        t.url().startsWith("chrome-extension://") &&
        // Our extension's service worker is background.js (not a built-in)
        (t.url().endsWith("background.js") ||
          t.url().endsWith("background.html"))
    );
    if (extTarget) {
      const extId = new URL(extTarget.url()).hostname;
      if (extId) {
        console.log(`[getExtensionId] Found via target URL: ${extId}`);
        return extId;
      }
    }
  }

  // ── Strategy 2: ANY non-empty chrome-extension service worker target ───────
  await new Promise((r) => setTimeout(r, 1000));
  const allTargets = browser.targets();
  const swTarget = allTargets.find(
    (t) =>
      t.type() === "service_worker" &&
      t.url().startsWith("chrome-extension://")
  );
  if (swTarget) {
    const extId = new URL(swTarget.url()).hostname;
    if (extId) {
      console.log(`[getExtensionId] Found via SW target (fallback): ${extId}`);
      return extId;
    }
  }

  // ── Strategy 3: chrome://extensions/ shadow DOM ───────────────────────────
  try {
    const page = await browser.newPage();
    await page.goto("chrome://extensions/", { waitUntil: "domcontentloaded", timeout: 10_000 });
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
    console.log(`[getExtensionId] Found via shadow DOM: ${id}`);
    return id;
  } catch (e) {
    console.warn("[getExtensionId] Shadow DOM strategy failed:", e);
  }

  // ── Strategy 4: deterministic ID computed from extension path ─────────────
  const computed = computeExtensionId(EXTENSION_DIST);
  console.log(`[getExtensionId] Using computed ID: ${computed}`);
  return computed;
}
