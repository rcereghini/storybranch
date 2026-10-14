import { chromium, type Page } from "playwright";
export async function startPlayback(page: Page) {
  await page.waitForFunction(() => {
    const v = document.querySelector("video");
    return (
      (v && !v.paused && v.currentTime > 0) ||
      document.querySelector(".scene-start")
    );
  });
  if (await page.locator(".scene-start").isVisible())
    await page.locator(".scene-start").click();
  await page.waitForFunction(() => {
    const v = document.querySelector("video");
    return v && !v.paused && v.currentTime > 0;
  });
}
import { existsSync } from "node:fs";
export function launchBrowser(args: string[] = []) {
  const localChrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
  return chromium.launch({
    headless: true,
    args,
    ...(existsSync(localChrome) ? { executablePath: localChrome } : {}),
  });
}
