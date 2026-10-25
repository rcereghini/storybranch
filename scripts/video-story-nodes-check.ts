import assert from "node:assert/strict";
import { launchBrowser, startPlayback } from "./browser";
import type { Page as BrowserTab } from "playwright";
async function showView(
  tab: BrowserTab,
  name: "StoryNodes" | "Edit StoryNode",
) {
  const views = tab.getByRole("navigation", { name: "Editor views" });
  if (await views.isVisible())
    await views
      .getByRole("button", {
        name:
          name === "Edit StoryNode" ? /^(Edit StoryNode|StoryTrunk)$/ : name,
      })
      .click();
  if (name === "Edit StoryNode")
    await tab
      .locator(".studio-panel .studio-tabs")
      .getByRole("button", { name: "StoryNode", exact: true })
      .click();
}
const browser = await launchBrowser();
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: 950 },
    });
    const tab = await context.newPage();
    tab.setDefaultTimeout(20000);
    const errors: string[] = [];
    tab.on("pageerror", (e) => errors.push(e.message));
    await tab.goto("http://127.0.0.1:5173/studio");
    await tab.getByRole("button", { name: "Sign in to create" }).click();
    await tab
      .getByRole("dialog")
      .getByRole("button", { name: "Sign in ↗" })
      .click();
    await tab.getByRole("dialog").waitFor({ state: "hidden" });
    await tab
      .getByRole("button", { name: "New starter story", exact: true })
      .click();
    await showView(tab, "Edit StoryNode");
    const title = `Reusable film ${width} ${Date.now()}`;
    await tab.getByLabel("StoryNode title", { exact: true }).fill(title);
    await tab
      .getByLabel("StoryNode type", { exact: true })
      .selectOption("video");
    await tab.getByLabel("After the video ends").selectOption("continue");
    await showView(tab, "StoryNodes");
    await tab
      .getByRole("group", { name: "Side panel", exact: true })
      .getByRole("button", { name: "Library", exact: true })
      .click();
    const [saved] = await Promise.all([
      tab.waitForResponse(
        (r) =>
          r.url().includes("/api/story-nodes/") &&
          r.request().method() === "POST",
      ),
      tab
        .getByRole("button", { name: "Save StoryNode to library", exact: true })
        .click(),
    ]);
    const record = await saved.json();
    assert.equal(record.content.videoAdvance, "continue");
    const libraryCard = tab
      .getByRole("region", { name: "StoryNode library" })
      .locator("section")
      .filter({ has: tab.getByRole("heading", { name: title, exact: true }) });
    await libraryCard
      .getByRole("button", { name: "Share StoryNode", exact: true })
      .click();
    await tab
      .getByText(/StoryNode link copied|Copy this StoryNode link/)
      .waitFor();
    const shared = await browser.newPage({ viewport: { width, height: 950 } });
    await shared.goto(
      `http://127.0.0.1:5173${width === 1440 ? "/story-nodes" : "/p"}/${record.id}/${record.revision}`,
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
      await shared.locator('[data-story-node-type="video"]').count(),
      1,
      "Continue mode must stay on the StoryNode after ended",
    );
    await shared.screenshot({
      path: `test-results/video-story-node-${width}.png`,
    });
    assert(
      await shared.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await shared.getByRole("button", { name: /01.*Continue/ }).click();
    await shared
      .getByRole("heading", { name: "StoryNode preview complete" })
      .waitFor();
    await shared.getByRole("button", { name: "Replay StoryNode" }).click();
    await startPlayback(shared);
    await shared.close();
    // Place the same revision in this story with a distinct instance ID.
    await libraryCard.getByRole("button", { name: "Use StoryNode" }).click();
    await showView(tab, "Edit StoryNode");
    const instance = await tab
      .getByLabel("Edit StoryNode", { exact: true })
      .inputValue();
    assert.notEqual(instance, "opening");
    await tab
      .getByLabel("StoryNode type", { exact: true })
      .selectOption("video-options");
    await tab
      .getByLabel("StoryNode title", { exact: true })
      .fill("Choose your next scene");
    await tab
      .getByLabel("Edit StoryNode", { exact: true })
      .selectOption("opening");
    await tab.getByLabel("Next", { exact: true }).selectOption(instance);
    await tab.getByRole("button", { name: "Preview", exact: true }).click();
    const preview = tab.locator(".studio-preview");
    await startPlayback(tab);
    await preview
      .locator(".scene-toolbar")
      .getByRole("button", { name: "Continue", exact: true })
      .click();
    await tab.waitForFunction(
      () =>
        document
          .querySelector(".studio-preview article")
          ?.getAttribute("data-story-node-type") === "video-options",
    );
    await startPlayback(tab);
    await preview.locator("video").evaluate((v: HTMLVideoElement) => {
      v.currentTime = v.duration - 0.15;
    });
    await tab.waitForFunction(
      () =>
        document.querySelector<HTMLVideoElement>(".studio-preview video")
          ?.ended,
    );
    await preview
      .getByRole("heading", { name: "Choose your next scene" })
      .waitFor();
    assert.equal(
      await preview.locator('[data-story-node-type="video-options"]').count(),
      1,
    );
    await preview.getByRole("button", { name: /01.*Continue/ }).click();
    await preview
      .getByRole("heading", { name: "The end", exact: true })
      .waitFor();
    const assets = await tab.context().newPage();
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
    await assets.getByText(`${photoName} is ready`, { exact: false }).waitFor();
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
    "PASS: reusable StoryNode save/share/placement, anonymous isolated preview, manual completion, video-to-options transition and explicit option routing at desktop/mobile sizes.",
  );
} catch (error) {
  for (const [index, context] of browser.contexts().entries())
    for (const tab of context.pages()) {
      await tab.screenshot({
        path: `test-results/video-story-node-failure-${index}.png`,
        fullPage: true,
      });
      console.error("StoryNode browser failure at", tab.url());
    }
  throw error;
} finally {
  await browser.close();
}
