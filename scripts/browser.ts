import { chromium } from "playwright";
import { existsSync } from "node:fs";
export function launchBrowser(args: string[] = []) {
  const localChrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
  return chromium.launch({
    headless: true,
    args,
    ...(existsSync(localChrome) ? { executablePath: localChrome } : {}),
  });
}
