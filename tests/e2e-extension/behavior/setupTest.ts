import { setupBrowser } from "./setupBrowser";
import { getExtensionId } from "./getExtensionId";

export async function setupTest() {
  const browser = await setupBrowser();
  const extensionId = await getExtensionId(browser);

  return { browser, extensionId };
}
