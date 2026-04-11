import puppeteer, { Browser } from "puppeteer-core";
import { install, Browser as BrowserName, detectBrowserPlatform, resolveBuildId, getInstalledBrowsers } from "@puppeteer/browsers";
import path from "path";
import fs from "fs";
import os from "os";

const EXTENSION_PATH = path.join(process.cwd(), "extension", "dist");

// Cache dir for the Puppeteer-managed Chrome stable download.
// This is the ONLY Chrome that reliably supports --load-extension in CI.
const CHROME_CACHE_DIR = path.join(os.homedir(), ".cache", "automation-sdk", "chromium");

/**
 * Resolve the path to the Puppeteer-downloaded Chrome stable binary.
 *
 * NEVER uses system Chrome (/usr/bin/google-chrome etc.) because enterprise
 * policies on system-managed Chrome block --load-extension.
 *
 * Falls back to EXTENSION_CHROME_PATH only when explicitly set AND the
 * caller knows it points to an unmanaged Chrome build that supports
 * --load-extension (e.g. a custom CI installation).
 *
 * @throws {ChromeUnavailableError} if Chrome can't be downloaded (offline)
 *   and no cached build exists.
 */
export class ChromeUnavailableError extends Error {
  constructor(reason: string) {
    super(`Chrome stable not available: ${reason}. ` +
      "Run: PUPPETEER_CACHE_DIR=~/.cache/automation-sdk/chromium npx @puppeteer/browsers install chrome@stable");
    this.name = "ChromeUnavailableError";
  }
}

async function resolveChromePath(): Promise<string> {
  // ── Check for already-cached Puppeteer Chrome ─────────────────────────────
  try {
    const platform = detectBrowserPlatform();
    if (platform) {
      const installed = await getInstalledBrowsers({ cacheDir: CHROME_CACHE_DIR });
      const chrome = installed.find((b) => b.browser === BrowserName.CHROME);
      if (chrome) {
        console.log(`[setupBrowser] Using cached Puppeteer Chrome: ${chrome.executablePath}`);
        return chrome.executablePath;
      }
    }
  } catch { /* not cached yet — fall through to download */ }

  // ── Attempt download from Puppeteer CDN ───────────────────────────────────
  try {
    const platform = detectBrowserPlatform();
    if (!platform) throw new Error("Unsupported platform");

    const buildId = await resolveBuildId(BrowserName.CHROME, platform, "stable");
    console.log(`[setupBrowser] Downloading Puppeteer Chrome stable (${buildId}) to ${CHROME_CACHE_DIR}…`);

    const result = await install({
      browser: BrowserName.CHROME,
      buildId,
      cacheDir: CHROME_CACHE_DIR,
      downloadProgressCallback: (downloaded: number, total: number) => {
        if (total > 0) {
          process.stdout.write(`\r  [setupBrowser] Downloading… ${Math.round((downloaded / total) * 100)}%`);
        }
      },
    });

    process.stdout.write("\n");
    console.log(`[setupBrowser] Chrome stable ready: ${result.executablePath}`);
    return result.executablePath;
  } catch (downloadErr) {
    // ── Explicit override path (must point to an unmanaged Chrome build) ────
    if (process.env.EXTENSION_CHROME_PATH) {
      console.warn(
        `[setupBrowser] Download failed (${(downloadErr as Error).message}). ` +
        `Falling back to EXTENSION_CHROME_PATH=${process.env.EXTENSION_CHROME_PATH}`
      );
      return process.env.EXTENSION_CHROME_PATH;
    }

    throw new ChromeUnavailableError((downloadErr as Error).message);
  }
}

const PROFILE_PREFIX = ".chrome-profile-";

function cleanOldProfiles(): void {
  try {
    for (const entry of fs.readdirSync(process.cwd())) {
      if (entry.startsWith(PROFILE_PREFIX)) {
        fs.rmSync(path.join(process.cwd(), entry), { recursive: true, force: true });
      }
    }
  } catch { /* non-fatal */ }
}

export async function setupBrowser(): Promise<Browser> {
  cleanOldProfiles();

  if (!fs.existsSync(EXTENSION_PATH)) {
    throw new Error(`Extension dist not found at ${EXTENSION_PATH} — run pnpm build:extension first`);
  }

  const executablePath = await resolveChromePath();
  const userDataDir = path.join(process.cwd(), `${PROFILE_PREFIX}${Date.now()}`);

  const browser = await puppeteer.launch({
    executablePath,
    headless: false,
    userDataDir,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
    ],
  });

  browser.on("disconnected", () => {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  });

  return browser;
}
