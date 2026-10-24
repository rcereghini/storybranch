import { launchBrowser, startPlayback } from "./browser";
import { mkdir, readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const browser = await launchBrowser();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const browserTab = await context.newPage();
const errors: string[] = [];
browserTab.on("pageerror", (e) => errors.push(e.message));
const click = async (name: string) => {
  await browserTab.getByRole("button", { name, exact: false }).first().click();
};
const heading = async (name: string) => {
  if (!["The Glass Harbor.", "Your story log"].includes(name)) {
    await browserTab
      .getByLabel(`${name} scene video`, { exact: true })
      .waitFor();
    // Most flow checks skip intentionally; automatic start/end is asserted separately.
    if (
      (await browserTab
        .locator(".scene-overlay")
        .getAttribute("aria-hidden")) === "true"
    )
      await browserTab
        .getByRole("button", { name: "Pause video", exact: true })
        .click();
  }
  await browserTab.getByRole("heading", { name, exact: true }).waitFor();
};
await mkdir("test-results", { recursive: true });
await context.tracing.start({ screenshots: true, snapshots: true });
try {
  await browserTab.goto("http://127.0.0.1:5173");
  await heading("The Glass Harbor.");
  await browserTab.screenshot({
    path: "test-results/catalogue-desktop.png",
    fullPage: true,
  });
  await click("Sign in");
  await browserTab.keyboard.press("Escape");
  await browserTab.getByRole("dialog").waitFor({ state: "hidden" });
  await click("Sign in");
  await browserTab
    .getByRole("dialog")
    .getByRole("button", { name: "Sign in ↗", exact: true })
    .click();
  await browserTab.getByRole("dialog").waitFor({ state: "hidden" });
  // Detail always permits a fresh run, regardless of pre-existing emulator saves.
  await browserTab.goto(
    "http://127.0.0.1:5173/s/glass-harbor/the-glass-harbor",
  );
  await click("Start a new journey");
  await startPlayback(browserTab);
  await browserTab.waitForFunction(() => {
    const v = document.querySelector("video");
    return v && !v.paused && v.currentTime > 0;
  });
  assert.equal(
    await browserTab
      .getByRole("button", { name: /Speak to the courier/ })
      .count(),
    0,
  );
  await browserTab.waitForFunction(
    () =>
      getComputedStyle(document.querySelector(".scene-overlay")!).opacity ===
      "0",
  );
  await browserTab.screenshot({
    path: "test-results/playback-active.png",
    fullPage: true,
  });
  await browserTab.waitForFunction(
    () => document.querySelector("video")?.ended,
  );
  await heading("A signal in the fog");
  assert(
    await browserTab
      .getByRole("button", { name: /Show your harbor pass/ })
      .isDisabled(),
  );
  await browserTab.locator("video").evaluate(async (v: HTMLVideoElement) => {
    await v.play();
  });
  await browserTab.waitForFunction(
    () => document.querySelector("video")!.currentTime > 0,
  );
  await browserTab
    .locator("video")
    .evaluate((v: HTMLVideoElement) => v.pause());
  // Lose the response after the server commits. Retry must use the same key.
  let dropped = false;
  await browserTab.route("**/api/playthroughs/*/choices", async (route) => {
    if (!dropped) {
      dropped = true;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await click("Speak to the courier");
  await browserTab
    .getByRole("button", { name: "Retry same request" })
    .waitFor();
  await click("Retry same request");
  await browserTab
    .getByLabel("A favor, remembered scene video", { exact: true })
    .waitFor();
  await browserTab.waitForFunction(() => {
    const v = document.querySelector("video");
    return v && !v.paused && v.currentTime > 0;
  });
  await heading("A favor, remembered");
  await browserTab.getByText("✓ Saved · revision 1", { exact: true }).waitFor();
  await browserTab.unroute("**/api/playthroughs/*/choices");
  await browserTab.reload();
  await heading("A favor, remembered");
  // Missing media remains playable through the complete transcript.
  await browserTab.route("**/media/*-landscape.mp4", (route) => route.abort());
  await browserTab.reload();
  await browserTab
    .getByText("The clip couldn’t load.", { exact: false })
    .waitFor();
  await assert.rejects(
    () => startPlayback(browserTab),
    /Playback failed:.*"source"/,
  );
  await browserTab.unroute("**/media/*-landscape.mp4");
  await click("Retry video");
  // The retried clip autoplays and makes the choices inert; if that lands
  // between focus and Enter the keypress is lost, so wait for it and skip.
  await startPlayback(browserTab);
  await click("Skip to choices");
  await browserTab.getByRole("button", { name: /Follow the lanterns/ }).focus();
  await browserTab.keyboard.press("Enter");
  await heading("The lantern market");
  // Check both delivery renditions and overlay bounds around the breakpoint.
  for (const width of [320, 390, 700, 701, 768, 1024, 1440]) {
    await browserTab.setViewportSize({ width, height: 1000 });
    await browserTab.waitForFunction(
      (portrait) =>
        document
          .querySelector("video")
          ?.currentSrc.includes(portrait ? "-portrait.mp4" : "-landscape.mp4"),
      width <= 700,
    );
    await browserTab.waitForFunction(
      () => document.querySelector("video")!.readyState >= 1,
    );
    if (
      (await browserTab
        .locator(".scene-overlay")
        .getAttribute("aria-hidden")) === "true"
    )
      await click("Skip to choices");
    const metrics = await browserTab.evaluate(() => {
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
        (await browserTab
          .locator(".scene-overlay")
          .evaluate(
            (e) =>
              e.scrollHeight > e.clientHeight &&
              getComputedStyle(e).overflowY === "auto",
          )),
      `Overlay out of bounds at ${width}`,
    );
    if (width === 390 || width === 1440)
      await browserTab.screenshot({
        path: `test-results/overlay-${width}.png`,
        fullPage: true,
      });
  }
  await browserTab
    .getByRole("button", { name: /^(Watch scene|Start story with sound)$/ })
    .click();
  await browserTab.getByRole("button", { name: "Skip to choices" }).waitFor();
  assert.equal(
    await browserTab
      .getByRole("button", { name: /Run across the rooftops/ })
      .count(),
    0,
  );
  await click("Skip to choices");
  await heading("The lantern market");
  await browserTab.getByText("Share this adventure", { exact: true }).click();
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: "http://127.0.0.1:5173",
  });
  await click("Copy story link");
  assert.equal(
    await browserTab.evaluate(() => navigator.clipboard.readText()),
    "http://127.0.0.1:5173/s/glass-harbor",
  );
  const downloadEvent = browserTab.waitForEvent("download");
  await browserTab
    .getByRole("link", { name: /Download vertical teaser/ })
    .click();
  const download = await downloadEvent;
  await download.saveAs("test-results/shared-teaser.mp4");
  const file = await readFile("test-results/shared-teaser.mp4");
  assert.equal(file.toString("ascii", 4, 8), "ftyp");
  const parentUrl = browserTab.url();
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
  assert.equal(browserTab.url(), parentUrl);
  await browserTab
    .getByText("More community stories (1)", { exact: true })
    .click();
  await click("Paper Moon");
  await heading("Paper Moon");
  await click("Return to main adventure");
  await heading("The lantern market");
  await browserTab.screenshot({
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
  await browserTab
    .getByText("Progress changed on another device.", { exact: false })
    .waitFor();
  await click("Reload current progress");
  await heading("A signal in the fog");
  await tab.close();
  await context.setOffline(true);
  await browserTab.getByText("You’re offline.", { exact: false }).waitFor();
  assert(
    await browserTab
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
  // Sign out lives in the account menu.
  await browserTab.getByRole("button", { name: "Account menu" }).click();
  await browserTab.getByRole("button", { name: "Sign out" }).click();
  await click("Sign in");
  await browserTab
    .getByLabel("Email", { exact: true })
    .fill("progressed@storybranch.test");
  await browserTab
    .getByRole("dialog")
    .getByRole("button", { name: "Sign in ↗", exact: true })
    .click();
  await browserTab.getByRole("dialog").waitFor({ state: "hidden" });
  await browserTab.goto("http://127.0.0.1:5173/s/glass-harbor");
  await click("Start a new journey");
  await heading("A signal in the fog");
  await click("Slip into the night market");
  await heading("The lantern market");
  await click("Run across the rooftops");
  await heading("The light returns");
  await browserTab.setViewportSize({ width: 390, height: 844 });
  await browserTab.screenshot({
    path: "test-results/player-mobile.png",
    fullPage: true,
  });
  assert(
    await browserTab.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await click("Discover");
  await heading("The Glass Harbor.");
  await browserTab.screenshot({
    path: "test-results/catalogue-mobile.png",
    fullPage: true,
  });
  assert(
    await browserTab.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  assert.deepEqual(errors, []);
  console.log(
    "Browser PASS: full player flow, portrait/landscape overlays at 320/390/700/701/768/1024/1440, watch/skip, public-link clipboard, MP4 download, side quests, stale/retry/offline, both endings, no StoryNode errors.",
  );
} catch (error) {
  await browserTab
    .screenshot({ path: "test-results/browser-failure.png", fullPage: true })
    .catch(() => {});
  await context.tracing
    .stop({ path: "test-results/browser-failure-trace.zip" })
    .catch(() => {});
  throw error;
} finally {
  await browser.close();
}
