import puppeteer, { Browser } from "puppeteer-core";
import { install, Browser as BrowserName, detectBrowserPlatform, resolveBuildId } from "@puppeteer/browsers";
import path from "path";
import fs from "fs";
import os from "os";

const EXTENSION_PATH = path.join(process.cwd(), "extension", "dist");

async function resolveChromePath(): Promise<string> {
  // EXTENSION_CHROME_PATH takes priority (explicit override for extension tests).
  // Falls through to auto-download when neither var is set.
  if (process.env.EXTENSION_CHROME_PATH) {
    return process.env.EXTENSION_CHROME_PATH;
  }

  const cacheDir = path.join(os.homedir(), ".cache", "automation-sdk", "chromium");
  const platform = detectBrowserPlatform();
  if (!platform) throw new Error("Unsupported platform for Chromium download");

  const buildId = await resolveBuildId(BrowserName.CHROME, platform, "stable");
  console.log(`[setupBrowser] Installing Chromium ${buildId} to ${cacheDir}…`);

  const installed = await install({
    browser: BrowserName.CHROME,
    buildId,
    cacheDir,
    downloadProgressCallback: (downloaded: number, total: number) => {
      if (total > 0) {
        process.stdout.write(`\r  Downloading… ${Math.round((downloaded / total) * 100)}%`);
      }
    },
  });

  process.stdout.write("\n");
  console.log(`[setupBrowser] Chromium ready at ${installed.executablePath}`);
  return installed.executablePath;
}

export async function setupBrowser(): Promise<Browser> {
  const userDataDir = path.join(
    process.cwd(),
    `.chrome-profile-${Date.now()}`
  );

  if (!fs.existsSync(EXTENSION_PATH)) {
    throw new Error(`Extension dist not found at ${EXTENSION_PATH} — run pnpm build:extension first`);
  }

  const executablePath = await resolveChromePath();

  return puppeteer.launch({
    executablePath,
    headless: false,
    userDataDir,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      "--no-sandbox",
      "--disable-setuid-sandbox"
    ]
  });
}
