import { launchBrowser, startPlayback } from "./browser";
import { mkdir, readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const browser = await launchBrowser();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
const click = async (name: string) => {
  await page.getByRole("button", { name, exact: false }).first().click();
};
const heading = async (name: string) => {
  if (!["The Glass Harbor.", "Your story log"].includes(name)) {
    await page.getByLabel(`${name} scene video`, { exact: true }).waitFor();
    // Most flow checks skip intentionally; automatic start/end is asserted separately.
    if (
      (await page.locator(".scene-overlay").getAttribute("aria-hidden")) ===
      "true"
    )
      await page
        .getByRole("button", { name: "Skip to choices", exact: true })
        .click();
  }
  await page.getByRole("heading", { name, exact: true }).waitFor();
};
await mkdir("test-results", { recursive: true });
await context.tracing.start({ screenshots: true, snapshots: true });
try {
  await page.goto("http://127.0.0.1:5173");
  await heading("The Glass Harbor.");
  await page.screenshot({
    path: "test-results/catalogue-desktop.png",
    fullPage: true,
  });
  await click("Sign in");
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await click("Sign in");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Sign in ↗", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  // Detail always permits a fresh run, regardless of pre-existing emulator saves.
  await page.goto("http://127.0.0.1:5173/s/glass-harbor/the-glass-harbor");
  await click("Start a new journey");
  await startPlayback(page);
  await page.waitForFunction(() => {
    const v = document.querySelector("video");
    return v && !v.paused && v.currentTime > 0;
  });
  assert.equal(
    await page.getByRole("button", { name: /Speak to the courier/ }).count(),
    0,
  );
  await page.waitForFunction(
    () =>
      getComputedStyle(document.querySelector(".scene-overlay")!).opacity ===
      "0",
  );
  await page.screenshot({
    path: "test-results/playback-active.png",
    fullPage: true,
  });
  await page.waitForFunction(() => document.querySelector("video")?.ended);
  await heading("A signal in the fog");
  assert(
    await page
      .getByRole("button", { name: /Show your harbor pass/ })
      .isDisabled(),
  );
  await page.locator("video").evaluate(async (v: HTMLVideoElement) => {
    await v.play();
  });
  await page.waitForFunction(
    () => document.querySelector("video")!.currentTime > 0,
  );
  await page.locator("video").evaluate((v: HTMLVideoElement) => v.pause());
  // Lose the response after the server commits. Retry must use the same key.
  let dropped = false;
  await page.route("**/api/playthroughs/*/choices", async (route) => {
    if (!dropped) {
      dropped = true;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await click("Speak to the courier");
  await page.getByRole("button", { name: "Retry same request" }).waitFor();
  await click("Retry same request");
  await page
    .getByLabel("A favor, remembered scene video", { exact: true })
    .waitFor();
  await page.waitForFunction(() => {
    const v = document.querySelector("video");
    return v && !v.paused && v.currentTime > 0;
  });
  await heading("A favor, remembered");
  await page.getByText("✓ Saved · revision 1", { exact: true }).waitFor();
  await page.unroute("**/api/playthroughs/*/choices");
  await page.reload();
  await heading("A favor, remembered");
  // Missing media remains playable through the complete transcript.
  await page.route("**/media/*-landscape.mp4", (route) => route.abort());
  await page.reload();
  await page.getByText("The clip couldn’t load.", { exact: false }).waitFor();
  await assert.rejects(() => startPlayback(page), /Playback failed:.*"source"/);
  await page.unroute("**/media/*-landscape.mp4");
  await click("Retry video");
  await page.getByRole("button", { name: /Follow the lanterns/ }).focus();
  await page.keyboard.press("Enter");
  await heading("The lantern market");
  // Check both delivery renditions and overlay bounds around the breakpoint.
  for (const width of [320, 390, 700, 701, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.waitForFunction(
      (portrait) =>
        document
          .querySelector("video")
          ?.currentSrc.includes(portrait ? "-portrait.mp4" : "-landscape.mp4"),
      width <= 700,
    );
    await page.waitForFunction(
      () => document.querySelector("video")!.readyState >= 1,
    );
    if (
      (await page.locator(".scene-overlay").getAttribute("aria-hidden")) ===
      "true"
    )
      await click("Skip to choices");
    const metrics = await page.evaluate(() => {
      const v = document.querySelector("video")!;
      const scene = document
        .querySelector(".scene-stage")!
        .getBoundingClientRect();
      const options = document
        .querySelector(".choices")!
        .getBoundingClientRect();
      return {
        overflow: document.documentElement.scrollWidth > innerWidth,
        ratio: v.videoWidth / v.videoHeight,
        sceneRight: scene.right,
        optionsRight: options.right,
        optionsBottom: options.bottom,
        sceneBottom: scene.bottom,
      };
    });
    assert.equal(metrics.overflow, false, `Horizontal overflow at ${width}`);
    assert(
      Math.abs(metrics.ratio - (width <= 700 ? 9 / 16 : 16 / 9)) < 0.01,
      `Wrong rendition at ${width}`,
    );
    assert(
      (metrics.optionsRight <= metrics.sceneRight + 1 &&
        metrics.optionsBottom <= metrics.sceneBottom + 1) ||
        (await page
          .locator(".scene-overlay")
          .evaluate(
            (e) =>
              e.scrollHeight > e.clientHeight &&
              getComputedStyle(e).overflowY === "auto",
          )),
      `Overlay out of bounds at ${width}`,
    );
    if (width === 390 || width === 1440)
      await page.screenshot({
        path: `test-results/overlay-${width}.png`,
        fullPage: true,
      });
  }
  await page
    .getByRole("button", { name: /^(Watch scene|Start story with sound)$/ })
    .click();
  await page.getByRole("button", { name: "Skip to choices" }).waitFor();
  assert.equal(
    await page.getByRole("button", { name: /Run across the rooftops/ }).count(),
    0,
  );
  await click("Skip to choices");
  await heading("The lantern market");
  await page.getByText("Share this adventure", { exact: true }).click();
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: "http://127.0.0.1:5173",
  });
  await click("Copy story link");
  assert.equal(
    await page.evaluate(() => navigator.clipboard.readText()),
    "http://127.0.0.1:5173/s/glass-harbor",
  );
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("link", { name: /Download vertical teaser/ }).click();
  const download = await downloadEvent;
  await download.saveAs("test-results/shared-teaser.mp4");
  const file = await readFile("test-results/shared-teaser.mp4");
  assert.equal(file.toString("ascii", 4, 8), "ftyp");
  const parentUrl = page.url();
  // Browser autoplay policy should offer a play gesture, not claim media is broken.
  const blockedTab = await context.newPage();
  await blockedTab.addInitScript(
    'window.originalPlay = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function(){ return Promise.reject(new DOMException("Gesture required", "NotAllowedError")); };',
  );
  await blockedTab.goto(parentUrl);
  await blockedTab
    .getByRole("button", { name: "Start story with sound", exact: true })
    .click();
  await blockedTab
    .getByRole("button", { name: "Play scene", exact: true })
    .waitFor();
  assert.equal(
    await blockedTab
      .getByText("The clip couldn’t load.", { exact: false })
      .count(),
    0,
  );
  await blockedTab.evaluate(
    "HTMLMediaElement.prototype.play = window.originalPlay",
  );
  await blockedTab
    .getByRole("button", { name: "Play scene", exact: true })
    .click();
  await blockedTab.waitForFunction(() => {
    const v = document.querySelector("video");
    return v && !v.paused && v.currentTime > 0;
  });
  await blockedTab.close();
  await click("The Bell Diver");
  await heading("The Bell Diver");
  await click("Follow the whisper");
  await heading("A small light");
  await click("Return to main adventure");
  await heading("The lantern market");
  assert.equal(page.url(), parentUrl);
  await page.getByText("More community stories (1)", { exact: true }).click();
  await click("Paper Moon");
  await heading("Paper Moon");
  await click("Return to main adventure");
  await heading("The lantern market");
  await page.screenshot({
    path: "test-results/player-desktop.png",
    fullPage: true,
  });
  // A second tab changes the revision. The first must reject, then reload.
  const tab = await context.newPage();
  await tab.goto(parentUrl);
  await tab
    .getByRole("heading", { name: "The lantern market", exact: true })
    .waitFor();
  await tab.getByRole("button", { name: /Circle back/ }).click();
  await tab
    .getByRole("heading", { name: "A signal in the fog", exact: true })
    .waitFor();
  await click("Run across the rooftops");
  await page
    .getByText("Progress changed on another device.", { exact: false })
    .waitFor();
  await click("Reload current progress");
  await heading("A signal in the fog");
  await tab.close();
  await context.setOffline(true);
  await page.getByText("You’re offline.", { exact: false }).waitFor();
  assert(
    await page
      .getByRole("button", { name: /Speak to the courier/ })
      .isDisabled(),
  );
  await context.setOffline(false);
  await click("Slip into the night market");
  await heading("The lantern market");
  await click("Run across the rooftops");
  await heading("Caught in the searchlight");
  await click("Surrender the signal");
  await heading("A quieter harbor");
  await click("Story log");
  await heading("Your story log");
  await page.getByRole("button", { name: /Sign out/ }).click();
  await click("Sign in");
  await page
    .getByLabel("Email", { exact: true })
    .fill("progressed@storybranch.test");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Sign in ↗", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.goto("http://127.0.0.1:5173/s/glass-harbor");
  await click("Start a new journey");
  await heading("A signal in the fog");
  await click("Slip into the night market");
  await heading("The lantern market");
  await click("Run across the rooftops");
  await heading("The light returns");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/player-mobile.png",
    fullPage: true,
  });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await click("Discover");
  await heading("The Glass Harbor.");
  await page.screenshot({
    path: "test-results/catalogue-mobile.png",
    fullPage: true,
  });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  assert.deepEqual(errors, []);
  console.log(
    "Browser PASS: full player flow, portrait/landscape overlays at 320/390/700/701/768/1024/1440, watch/skip, public-link clipboard, MP4 download, side quests, stale/retry/offline, both endings, no page errors.",
  );
} catch (error) {
  await page
    .screenshot({ path: "test-results/browser-failure.png", fullPage: true })
    .catch(() => {});
  await context.tracing
    .stop({ path: "test-results/browser-failure-trace.zip" })
    .catch(() => {});
  throw error;
} finally {
  await browser.close();
}
