import puppeteer, { Browser } from "puppeteer-core";
import path from "path";
import fs from "fs";

const EXTENSION_PATH = path.join(process.cwd(), "extension", "dist");
const CHROME_PATH = process.env.CHROME_PATH ?? "/usr/bin/google-chrome";

export async function setupBrowser(): Promise<Browser> {
  const userDataDir = path.join(
    process.cwd(),
    `.chrome-profile-${Date.now()}`
  );

  if (!fs.existsSync(EXTENSION_PATH)) {
    throw new Error(`Extension dist not found at ${EXTENSION_PATH} — run pnpm build:extension first`);
  }

  return puppeteer.launch({
    executablePath: CHROME_PATH,
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
