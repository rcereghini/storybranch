import assert from "node:assert/strict";
import { launchBrowser, startPlayback } from "./browser";
const browser = await launchBrowser();
try {
  for (const width of [1440, 390]) {
    const tab = await browser.newPage({ viewport: { width, height: 900 } });
    let releaseCatalogue!: () => void;
    const catalogueGate = new Promise<void>((resolve) => {
      releaseCatalogue = resolve;
    });
    await tab.route("**/api/catalogue", async (route) => {
      await catalogueGate;
      await route.continue();
    });
    await tab.goto("http://127.0.0.1:5173");
    await tab.locator(".loading-overlay").waitFor();
    const loadingHero = await tab.locator(".disc-hero").boundingBox();
    assert.equal(
      await tab
        .locator(".loading-overlay")
        .evaluate((el) => getComputedStyle(el).position),
      "fixed",
    );
    releaseCatalogue();
    await tab.locator(".loading-overlay").waitFor({ state: "hidden" });
    assert.deepEqual(
      await tab.locator(".disc-hero").boundingBox(),
      loadingHero,
      "Catalogue loading must not shift or resize the hero",
    );
    await tab.unroute("**/api/catalogue");
    await tab
      .getByRole("button", { name: /Sign in/ })
      .first()
      .click();
    await tab.getByText("LOCAL EMULATOR ACCOUNTS").waitFor();
    await tab
      .getByRole("dialog")
      .getByRole("button", { name: "Sign in ↗" })
      .click();
    await tab.getByRole("dialog").waitFor({ state: "hidden" });
    await tab.goto("http://127.0.0.1:5173/s/glass-harbor");
    await tab.getByRole("button", { name: "Start a new journey" }).click();
    await startPlayback(tab);
    await tab.waitForFunction(
      () => document.querySelector("video")!.currentTime > 0.2,
    );
    await tab.getByRole("button", { name: "Skip to choices" }).click();
    await tab.locator(".scene-stage").scrollIntoViewIfNeeded();
    await tab.route("**/choices", async (route) => {
      await new Promise((r) => setTimeout(r, 800));
      await route.continue();
    });
    await tab.route("**/glass-harbor-courier-mock-v1-*.mp4", async (route) => {
      await new Promise((r) => setTimeout(r, 800));
      await route.continue();
    });
    await tab.evaluate("globalThis.__name = (fn) => fn");
    await tab.evaluate(() => {
      const w = window as any;
      w.samples = [];
      w.sampling = true;
      w.originalVideo = document.querySelector("video");
      function sample() {
        const r = document
          .querySelector(".scene-stage")!
          .getBoundingClientRect();
        w.samples.push({
          top: r.top + scrollY,
          height: r.height,
          controls: document.querySelector("video")!.controls,
        });
        if (w.sampling) requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    });
    const transitionRequests: string[] = [];
    tab.on("request", (request) => {
      if (request.url().includes("/api/playthroughs/"))
        transitionRequests.push(request.method() + " " + request.url());
    });
    const transitionStarted = Date.now();
    await tab.getByRole("button", { name: /Speak to the courier/ }).click();
    await tab.waitForFunction(() => {
      const v = document.querySelector("video")!;
      return (
        v.currentSrc.includes("courier") && v.currentTime > 0.2 && !v.paused
      );
    });
    const result = await tab.evaluate(() => {
      const w = window as any;
      w.sampling = false;
      return {
        samples: w.samples,
        reused: w.originalVideo === document.querySelector("video"),
      };
    });
    assert.equal(
      transitionRequests.filter((r) => r.startsWith("POST ")).length,
      1,
    );
    assert.equal(
      transitionRequests.filter((r) => r.startsWith("GET ")).length,
      0,
      "Committed transitions must not refetch the player",
    );
    console.log(
      width +
        "px click-to-playing with injected API/media delays: " +
        (Date.now() - transitionStarted) +
        "ms",
    );
    assert(result.reused);
    for (const field of ["top", "height"]) {
      const values = result.samples.map((s: any) => s[field]);
      assert(
        Math.max(...values) - Math.min(...values) < 2,
        `${width}: stage ${field} shifted`,
      );
    }
    assert(result.samples.every((s: any) => !s.controls));
    await tab.getByRole("button", { name: "Mute", exact: true }).click();
    assert(
      await tab.locator("video").evaluate((v: HTMLVideoElement) => v.muted),
    );
    await tab.getByRole("button", { name: "Pause video", exact: true }).click();
    assert(
      await tab.locator("video").evaluate((v: HTMLVideoElement) => v.paused),
    );
    await tab.close();
  }
  console.log(
    "PASS: stable video bounds throughout delayed API/media transitions, no native timeline, reused player, custom mute/pause on desktop/mobile.",
  );
} finally {
  await browser.close();
}
