import assert from "node:assert/strict";
import { launchBrowser, startPlayback } from "./browser";
const browser = await launchBrowser();
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.goto("http://127.0.0.1:5173");
    await page
      .getByRole("button", { name: /Sign in/ })
      .first()
      .click();
    await page.getByText("LOCAL EMULATOR ACCOUNTS").waitFor();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Sign in ↗" })
      .click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page.goto("http://127.0.0.1:5173/s/glass-harbor");
    await page.getByRole("button", { name: "Start a new journey" }).click();
    await startPlayback(page);
    await page.waitForFunction(
      () => document.querySelector("video")!.currentTime > 0.2,
    );
    await page.getByRole("button", { name: "Skip to choices" }).click();
    await page.locator(".scene-stage").scrollIntoViewIfNeeded();
    await page.route("**/choices", async (route) => {
      await new Promise((r) => setTimeout(r, 800));
      await route.continue();
    });
    await page.route("**/glass-harbor-courier-mock-v1-*.mp4", async (route) => {
      await new Promise((r) => setTimeout(r, 800));
      await route.continue();
    });
    await page.evaluate("globalThis.__name = (fn) => fn");
    await page.evaluate(() => {
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
    await page.getByRole("button", { name: /Speak to the courier/ }).click();
    await page.waitForFunction(() => {
      const v = document.querySelector("video")!;
      return (
        v.currentSrc.includes("courier") && v.currentTime > 0.2 && !v.paused
      );
    });
    const result = await page.evaluate(() => {
      const w = window as any;
      w.sampling = false;
      return {
        samples: w.samples,
        reused: w.originalVideo === document.querySelector("video"),
      };
    });
    assert(result.reused);
    for (const field of ["top", "height"]) {
      const values = result.samples.map((s: any) => s[field]);
      assert(
        Math.max(...values) - Math.min(...values) < 2,
        `${width}: stage ${field} shifted`,
      );
    }
    assert(result.samples.every((s: any) => !s.controls));
    await page.getByRole("button", { name: "Mute", exact: true }).click();
    assert(
      await page.locator("video").evaluate((v: HTMLVideoElement) => v.muted),
    );
    await page
      .getByRole("button", { name: "Pause video", exact: true })
      .click();
    assert(
      await page.locator("video").evaluate((v: HTMLVideoElement) => v.paused),
    );
    await page.close();
  }
  console.log(
    "PASS: stable video bounds throughout delayed API/media transitions, no native timeline, reused player, custom mute/pause on desktop/mobile.",
  );
} finally {
  await browser.close();
}
