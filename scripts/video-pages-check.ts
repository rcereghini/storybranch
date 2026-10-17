import assert from "node:assert/strict";
import { launchBrowser, startPlayback } from "./browser";
const browser = await launchBrowser();
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: 950 },
    });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://127.0.0.1:5173/studio");
    await page.getByRole("button", { name: "Sign in to create" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Sign in ↗" })
      .click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "New story", exact: true }).click();
    const title = `Reusable film ${width} ${Date.now()}`;
    await page.getByLabel("Page title", { exact: true }).fill(title);
    await page.getByLabel("Page type", { exact: true }).selectOption("video");
    await page.getByLabel("After the video ends").selectOption("continue");
    const saved = page.waitForResponse(
      (r) => r.url().includes("/api/pages/") && r.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Save page to library", exact: true })
      .click();
    const record = await (await saved).json();
    assert.equal(record.content.videoAdvance, "continue");
    const libraryCard = page
      .getByRole("region", { name: "Page library" })
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
    await libraryCard
      .getByRole("button", { name: "Share page", exact: true })
      .click();
    await page.getByText(/Page link copied|Copy this page link/).waitFor();
    const shared = await browser.newPage({ viewport: { width, height: 950 } });
    await shared.goto(
      `http://127.0.0.1:5173/p/${record.id}/${record.revision}`,
    );
    await startPlayback(shared);
    await shared.locator("video").evaluate((v: HTMLVideoElement) => {
      v.currentTime = v.duration - 0.15;
    });
    await shared.waitForFunction(() => document.querySelector("video")?.ended);
    await shared.getByRole("heading", { name: title, exact: true }).waitFor();
    await shared.waitForFunction(
      () =>
        getComputedStyle(document.querySelector(".scene-overlay")!).opacity ===
        "1",
    );
    assert.equal(
      await shared.locator('[data-page-type="video"]').count(),
      1,
      "Continue mode must stay on the page after ended",
    );
    await shared.screenshot({ path: `test-results/video-page-${width}.png` });
    assert(
      await shared.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await shared.getByRole("button", { name: /01.*Continue/ }).click();
    await shared
      .getByRole("heading", { name: "Page preview complete" })
      .waitFor();
    await shared.getByRole("button", { name: "Replay page" }).click();
    await startPlayback(shared);
    await shared.close();
    // Place the same revision in this story with a distinct instance ID.
    await libraryCard.getByRole("button", { name: "Use page" }).click();
    const instance = await page
      .getByLabel("Edit page", { exact: true })
      .inputValue();
    assert.notEqual(instance, "opening");
    await page
      .getByLabel("Page type", { exact: true })
      .selectOption("video-options");
    await page
      .getByLabel("Page title", { exact: true })
      .fill("Choose your next scene");
    await page.getByLabel("Edit page", { exact: true }).selectOption("opening");
    await page.getByLabel("Next page", { exact: true }).selectOption(instance);
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    const preview = page.locator(".studio-preview");
    await startPlayback(page);
    await preview
      .locator(".scene-toolbar")
      .getByRole("button", { name: "Continue", exact: true })
      .click();
    await page.waitForFunction(
      () =>
        document
          .querySelector(".studio-preview article")
          ?.getAttribute("data-page-type") === "video-options",
    );
    await startPlayback(page);
    await preview.locator("video").evaluate((v: HTMLVideoElement) => {
      v.currentTime = v.duration - 0.15;
    });
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLVideoElement>(".studio-preview video")
          ?.ended,
    );
    await preview
      .getByRole("heading", { name: "Choose your next scene" })
      .waitFor();
    assert.equal(
      await preview.locator('[data-page-type="video-options"]').count(),
      1,
    );
    await preview.getByRole("button", { name: /01.*Continue/ }).click();
    await preview
      .getByRole("heading", { name: "The end", exact: true })
      .waitFor();
    const assets = await page.context().newPage();
    await assets.goto("http://127.0.0.1:5173/assets");
    const photoName = `photo-${width}-${Date.now()}.png`;
    await assets.getByLabel("Upload a photo", { exact: true }).setInputFiles({
      name: photoName,
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aYx8AAAAASUVORK5CYII=",
        "base64",
      ),
    });
    await assets
      .getByText(`Uploaded ${photoName}.`, { exact: false })
      .waitFor();
    await assets.getByRole("img", { name: photoName, exact: true }).waitFor();
    assert(
      await assets
        .getByRole("img", { name: photoName, exact: true })
        .evaluate((image: HTMLImageElement) => image.naturalWidth > 0),
    );
    await assets.close();
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log(
    "PASS: reusable page save/share/placement, anonymous isolated preview, manual completion, video-to-options transition and explicit option routing at desktop/mobile sizes.",
  );
} finally {
  await browser.close();
}
