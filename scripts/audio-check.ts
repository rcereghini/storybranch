import assert from "node:assert/strict";
import { launchBrowser, startPlayback } from "./browser";
import { webkit, type Browser } from "playwright";
let webkitBrowser: Browser | undefined;

// No autoplay exemption: fresh context, no engagement history or preloaded grant.
const browser = await launchBrowser([
  "--autoplay-policy=document-user-activation-required",
  "--disable-features=PreloadMediaEngagementData,MediaEngagementBypassAutoplayPolicies",
]);
const deadline = setTimeout(() => {
  console.error(
    "Audio verification exceeded 90 seconds; stopping browser processes.",
  );
  void browser.close();
  void webkitBrowser?.close();
  setTimeout(() => process.exit(1), 5000).unref();
}, 90000);
try {
  const context = await browser.newContext();
  const tab = await context.newPage();
  await tab.goto("http://127.0.0.1:5173");
  await tab.getByRole("button", { name: "Sign in", exact: false }).click();
  await tab
    .getByRole("dialog")
    .getByRole("button", { name: "Sign in ↗", exact: true })
    .click();
  await tab.getByRole("dialog").waitFor({ state: "hidden" });
  await tab.goto("http://127.0.0.1:5173/s/glass-harbor/the-glass-harbor");
  await tab.getByRole("button", { name: /Start a new journey/ }).click();
  await tab.locator("video").waitFor();
  await startPlayback(tab);
  const url = tab.url();
  const state = await context.storageState({ indexedDB: true });

  const engine = process.argv.includes("--webkit")
    ? (webkitBrowser = await webkit.launch())
    : browser;
  const fresh = await engine.newContext({ storageState: state });
  fresh.setDefaultTimeout(15000);
  const test = await fresh.newPage();
  console.log("Playback tab created.");
  await test.goto(url);
  await startPlayback(test);
  await test.waitForFunction(() => {
    const v = document.querySelector("video")!;
    return (
      !v.paused &&
      !v.muted &&
      v.currentTime > 0.1 &&
      v.videoWidth > 0 &&
      ((v as HTMLVideoElement & { webkitAudioDecodedByteCount: number })
        .webkitAudioDecodedByteCount > 0 ||
        (v as HTMLVideoElement & { audioTracks?: { length: number } })
          .audioTracks?.length)
    );
  });
  await test.evaluate(
    "window.authorizedVideo = document.querySelector('video'); window.authorizedVideo.volume = 0.4",
  );
  await test.waitForFunction(() => document.querySelector("video")!.ended);
  await test.route("**/api/playthroughs/*/choices", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 6500));
    await route.continue();
  });
  await test.getByRole("button", { name: /Speak to the courier/ }).click();
  await test
    .getByLabel("A favor, remembered scene video", { exact: true })
    .waitFor();
  await test.waitForFunction(() => {
    const v = document.querySelector("video")!;
    return !v.paused && v.currentTime > 0.1 && !v.muted;
  });
  assert(
    await test.evaluate(
      "window.authorizedVideo === document.querySelector('video')",
    ),
  );
  assert.equal(
    await test.locator("video").evaluate((v: HTMLVideoElement) => v.volume),
    0.4,
  );
  await test.setViewportSize({ width: 390, height: 844 });
  await test.waitForFunction(
    () =>
      !document.querySelector("video")!.paused &&
      document.querySelector("video")!.currentTime > 0.1,
  );
  assert(
    await test.evaluate(
      "window.authorizedVideo === document.querySelector('video')",
    ),
  );
  console.log(
    `Audio PASS (${webkitBrowser ? "Playwright WebKit on Windows" : "Chrome"}): automatic sound start or browser gesture fallback; actual H.264/AAC fixture with audio track; next scene plays unmuted after 6.5s validation delay; same video element and volume across choice and portrait switch. Safari/physical devices not covered.`,
  );
} catch (error) {
  console.error("Audio verification failed:", error);
  throw error;
} finally {
  clearTimeout(deadline);
  await Promise.race([
    Promise.all([webkitBrowser?.close(), browser.close()]),
    new Promise<void>((resolve) => setTimeout(resolve, 5000).unref()),
  ]);
}
