import assert from "node:assert/strict";
import { launchBrowser } from "./browser";
const browser = await launchBrowser();
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 950 } });
    const errors: string[] = [];
    page.on("pageerror", (e) => {
      errors.push(e.message);
      console.error(e.message);
    });
    await page.goto("http://127.0.0.1:5173/studio");
    await page.getByRole("button", { name: "Sign in to create" }).click();
    await page.getByText("LOCAL EMULATOR ACCOUNTS").waitFor();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Sign in ↗" })
      .click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "New story", exact: true }).click();
    const title = `Studio journey ${width} ${Date.now()}`;
    await page.getByLabel("Story title", { exact: true }).fill(title);
    await page
      .getByLabel("Description", { exact: true })
      .fill("A story created and published through Studio.");
    await page.getByLabel("Page type", { exact: true }).selectOption("dice");
    await page
      .getByLabel("Text / transcript", { exact: true })
      .fill("Roll to find your way home.");
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await page.getByText("Draft saved privately.", { exact: false }).waitFor();
    await page.reload();
    await page.waitForFunction(
      () => !document.querySelector(".loading-overlay"),
    );
    while (
      !(await page.getByRole("button", { name: new RegExp(title) }).count()) &&
      (await page
        .getByRole("button", { name: "More drafts", exact: true })
        .count())
    ) {
      const count = await page.locator(".studio-draft-card").count();
      const nextPage = page.waitForResponse(
        (r) =>
          r.request().method() === "GET" &&
          r.url().includes("/api/studio?cursor="),
      );
      await page
        .getByRole("button", { name: "More drafts", exact: true })
        .click();
      const data = await (await nextPage).json();
      await page.waitForFunction(
        (expected) =>
          document.querySelectorAll(".studio-draft-card").length >= expected,
        count + data.items.length,
      );
      if (!data.nextCursor) break;
    }
    await page.getByRole("button", { name: new RegExp(title) }).click();
    assert.equal(
      await page.getByLabel("Page type", { exact: true }).inputValue(),
      "dice",
    );
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await page
      .locator(".studio-preview")
      .getByRole("button", { name: /Roll d20/ })
      .click();
    await page.locator(".dice-face").getByText("20", { exact: true }).waitFor();
    await page
      .locator(".studio-preview")
      .getByRole("button", { name: /Next page/ })
      .click();
    await page
      .locator(".studio-preview")
      .getByRole("heading", { name: "The end" })
      .waitFor();
    await page.getByRole("button", { name: "Close preview" }).click();
    await page
      .getByRole("button", { name: "Publish edition", exact: true })
      .click();
    await page
      .getByText("Published edition-1. Your story is now in Discover.", {
        exact: false,
      })
      .waitFor();
    await page.waitForFunction(
      () => !document.querySelector(".loading-overlay"),
    );
    await page.screenshot({
      path: `test-results/studio-${width}.png`,
      fullPage: true,
    });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.getByRole("button", { name: "Play published story" }).click();
    await page.getByRole("heading", { name: "Opening", exact: true }).waitFor();
    await page.getByRole("button", { name: /Roll d20/ }).click();
    await page
      .locator(".dice-face")
      .getByText("You rolled", { exact: true })
      .waitFor();
    await page.getByRole("button", { name: /Next page/ }).click();
    await page.getByRole("heading", { name: "The end" }).waitFor();
    assert.deepEqual(errors, []);
    await page.close();
  }
  // Upload a clip, preview it, publish and play it from Storage.
  const page = await browser.newPage({
    viewport: { width: 1440, height: 950 },
  });
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
  await page
    .getByLabel("Story title", { exact: true })
    .fill(`Uploaded clip ${Date.now()}`);
  await page.getByLabel("Page type", { exact: true }).selectOption("video");
  await page
    .getByLabel("Upload a clip", { exact: true })
    .setInputFiles("apps/web/public/media/harbor-landscape-audio-v1.mp4");
  await page
    .getByText("Uploaded harbor-landscape-audio-v1.mp4", { exact: false })
    .waitFor({ timeout: 30000 });
  assert.match(
    await page.getByLabel("Video clip", { exact: true }).inputValue(),
    /^asset:/,
  );
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.getByText("Draft saved privately.", { exact: false }).waitFor();
  const storageSource = (scope: string) =>
    page.waitForFunction(
      (selector) => {
        const video = document.querySelector<HTMLVideoElement>(selector);
        return (
          !!video &&
          video.currentSrc.startsWith("http://127.0.0.1:9299/") &&
          video.readyState >= 1
        );
      },
      `${scope} video`,
      { timeout: 20000 },
    );
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await storageSource(".studio-preview");
  await page.getByRole("button", { name: "Close preview" }).click();
  await page
    .getByRole("button", { name: "Publish edition", exact: true })
    .click();
  await page.getByText("Published edition-1.", { exact: false }).waitFor();
  await page.waitForFunction(() => !document.querySelector(".loading-overlay"));
  await page.getByRole("button", { name: "Play published story" }).click();
  await storageSource(".scene-player");
  assert.deepEqual(errors, []);
  await page.close();
  console.log(
    "PASS: desktop/mobile create, edit, private save/reload, shared Page preview, publish and authoritative play; clip upload, preview and published playback from Storage.",
  );
} finally {
  await browser.close();
}
