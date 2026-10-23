import assert from "node:assert/strict";
import type { Page } from "playwright";
import { launchBrowser } from "./browser";

// On narrow screens the editor shows one view at a time.
export const showView = async (page: Page, view: "Pages" | "Map" | "Panel") => {
  const views = page.locator(".studio-views");
  if (!(await views.isVisible())) return;
  await views
    .getByRole("button", {
      name: view === "Panel" ? /Edit page|Story/ : view,
      exact: view !== "Panel",
    })
    .click();
};
export const showPane = async (page: Page, pane: "Page" | "Story") => {
  await showView(page, "Panel");
  await page
    .locator(".studio-panel .studio-tabs")
    .getByRole("button", { name: pane, exact: true })
    .click();
};
const saved = (page: Page) =>
  page
    .locator(".studio-status")
    .getByText("All changes saved", { exact: true })
    .waitFor();
const signIn = async (page: Page) => {
  await page.goto("http://127.0.0.1:5173/studio");
  await page.getByRole("button", { name: "Sign in to create" }).click();
  await page.getByText("LOCAL EMULATOR ACCOUNTS").waitFor();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Sign in ↗" })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
};

const browser = await launchBrowser();
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 950 } });
    const errors: string[] = [];
    page.on("pageerror", (e) => {
      errors.push(e.message);
      console.error(e.message);
    });
    await signIn(page);
    await page.getByRole("button", { name: "New story", exact: true }).click();
    const title = `Studio journey ${width} ${Date.now()}`;
    // Autosave: editing alone saves the draft, without pressing Save.
    const autosaved = page.waitForResponse(
      (r) =>
        r.request().method() === "POST" &&
        /\/api\/studio\/[^/]+$/.test(r.url()),
    );
    await page.getByLabel("Story title", { exact: true }).fill(title);
    assert.equal((await autosaved).status(), 200);
    await saved(page);
    await showPane(page, "Story");
    await page
      .getByLabel("Description", { exact: true })
      .fill("A story created and published through Studio.");
    await showPane(page, "Page");
    await page.getByLabel("Page type", { exact: true }).selectOption("dice");
    await page
      .getByLabel("Text / transcript", { exact: true })
      .fill("Roll to find your way home.");
    // Ctrl/Cmd+S saves straight away.
    const quick = page.waitForResponse(
      (r) =>
        r.request().method() === "POST" &&
        /\/api\/studio\/[^/]+$/.test(r.url()),
    );
    await page.keyboard.press("Control+s");
    const record = await (await quick).json();
    assert.equal(
      record.story.pages.opening.transcript,
      "Roll to find your way home.",
    );
    await saved(page);
    await page.screenshot({ path: `test-results/studio-editor-${width}.png` });
    assert(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <= innerWidth &&
          document.documentElement.scrollHeight <= innerHeight + 1,
      ),
      "The editor fits the window without page scrolling",
    );
    await page.reload();
    // The list has loaded once its first card shows.
    await page.locator(".studio-draft-card").first().waitFor();
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
    await page.locator(".studio-shell").waitFor();
    await showPane(page, "Page");
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
      // Editions are numbered by the saved revision they publish.
      .getByText(/Published edition-\d+\. Your story is now in Discover\./)
      .waitFor();
    await page.waitForFunction(
      () => !document.querySelector(".loading-overlay"),
    );
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
  {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 950 },
    });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await signIn(page);
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
    await saved(page);
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
    await page.getByText(/Published edition-\d+\./).waitFor();
    await page.waitForFunction(
      () => !document.querySelector(".loading-overlay"),
    );
    await page.getByRole("button", { name: "Play published story" }).click();
    await storageSource(".scene-player");
    assert.deepEqual(errors, []);
    await page.close();
  }

  // AI help, with the model and the image provider faked in the browser:
  // suggestions cover the text field and change nothing until accepted.
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 950 } });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/profile", async (route) => {
      const response = await route.fetch();
      const profile = await response.json();
      await route.fulfill({
        response,
        json: {
          ...profile,
          features: { ...profile.features, copilot: true },
        },
      });
    });
    const asked: any[] = [];
    await page.route("**/api/assist", async (route) => {
      const command = route.request().postDataJSON();
      asked.push(command);
      await new Promise((r) => setTimeout(r, 300));
      const answers: Record<string, unknown> = {
        write: { action: "write", text: "Rain needles the harbor." },
        rewrite: { action: "rewrite", text: "Rain. The harbor waits." },
        choices: {
          action: "choices",
          choices: [
            {
              label: "Follow the lantern",
              title: "The lantern",
              text: "It bobs ahead.",
            },
            {
              label: "Hide in the boat",
              title: "The boat",
              text: "Wet ropes, cold hands.",
            },
          ],
        },
        "image-prompt": {
          action: "image-prompt",
          prompt: "A rain-soaked harbor at night, lanterns, a lone courier.",
        },
      };
      await route.fulfill({ json: answers[command.action] });
    });
    const generated: any[] = [];
    await page.route("**/api/generation**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (request.method() === "GET")
        return route.fulfill({
          json: { enabled: true, reason: null, remaining: 100, jobs: [] },
        });
      if (url.pathname === "/api/generation") {
        generated.push(request.postDataJSON());
        return route.fulfill({
          json: {
            id: "job-1",
            kind: "image",
            prompt: "x",
            status: "queued",
            quality: "draft",
            createdAt: Date.now(),
          },
        });
      }
      return route.fulfill({
        json: {
          id: "job-1",
          kind: "image",
          prompt: "x",
          status: "ready",
          createdAt: Date.now(),
          asset: {
            id: "generated-test",
            fileName: "generated.jpg",
            contentType: "image/jpeg",
            status: "ready",
            url: "/og/default.png",
            durationSeconds: 0,
            sizeBytes: 1000,
            createdAt: Date.now(),
          },
        },
      });
    });
    await signIn(page);
    await page.getByRole("button", { name: "New story", exact: true }).click();
    await page
      .getByLabel("Story title", { exact: true })
      .fill(`AI help ${width}`);
    await showPane(page, "Page");
    const text = page.getByLabel("Text / transcript", { exact: true });
    const field = await text.boundingBox();
    await page.getByRole("button", { name: "✦ Write it" }).click();
    const suggestion = page.getByRole("region", { name: "AI suggestion" });
    await suggestion.getByText("Rain needles the harbor.").waitFor();
    assert.equal(
      await text.inputValue(),
      "What happens here?",
      "Nothing changes before accepting",
    );
    assert.deepEqual(
      await text.boundingBox(),
      field,
      "The suggestion does not move the field",
    );
    assert.equal(
      asked[0].page.text,
      "",
      "The placeholder is not sent as page text",
    );
    await suggestion.getByRole("button", { name: "Use this text" }).click();
    assert.equal(await text.inputValue(), "Rain needles the harbor.");
    await page
      .getByLabel("Rewrite style")
      .selectOption({ label: "More suspense" });
    await page.getByRole("button", { name: "✦ Rewrite" }).click();
    await suggestion.getByText("Rain. The harbor waits.").waitFor();
    assert.equal(asked[1].instruction, "more suspense");
    await suggestion.getByRole("button", { name: "Discard" }).click();
    assert.equal(await text.inputValue(), "Rain needles the harbor.");
    await page.getByRole("button", { name: "✦ Suggest choices" }).click();
    await suggestion.getByRole("button", { name: "Add these choices" }).click();
    assert.equal(
      await page.getByLabel("Page type", { exact: true }).inputValue(),
      "text-options",
    );
    assert.equal(
      await page.getByLabel("Option 1 label").inputValue(),
      "Follow the lantern",
    );
    assert.equal(
      await page.getByLabel("Option 2 label").inputValue(),
      "Hide in the boat",
    );
    await showView(page, "Pages");
    await page
      .locator(".story-outline strong", { hasText: /^The lantern$/ })
      .waitFor();
    // Undo reverses the whole accepted suggestion (narrow screens hide undo).
    if (width === 1440) {
      await page.locator(".studio-bar").click({ position: { x: 600, y: 20 } });
      await page.getByRole("button", { name: "Undo" }).click();
      assert.equal(
        await page
          .locator(".story-outline strong", { hasText: /^The lantern$/ })
          .count(),
        0,
      );
      await page.getByRole("button", { name: "Redo" }).click();
      await page
        .locator(".story-outline strong", { hasText: /^The lantern$/ })
        .waitFor();
    }
    // Page image: AI writes the prompt, then the generated image is attached.
    await showPane(page, "Page");
    await page.getByRole("button", { name: "✦ Generate a page image" }).click();
    const dialog = page.getByRole("dialog", { name: "Generate a page image" });
    await dialog
      .getByRole("button", { name: "✦ Write the prompt with AI" })
      .click();
    await page.waitForFunction(() =>
      document
        .querySelector<HTMLTextAreaElement>('[role="dialog"] textarea')
        ?.value.startsWith("A rain-soaked harbor"),
    );
    await dialog.getByRole("button", { name: "Portrait" }).click();
    await page.screenshot({
      path: `test-results/studio-image-dialog-${width}.png`,
    });
    await dialog
      .getByRole("button", { name: "Generate image", exact: true })
      .click();
    await dialog.waitFor({ state: "hidden" });
    assert.equal(generated[0].aspect, "9:16");
    assert.equal(generated[0].quality, "draft");
    assert.equal(
      await page.getByLabel("Page photo", { exact: true }).inputValue(),
      "asset:generated-test",
    );
    await page.screenshot({ path: `test-results/studio-ai-${width}.png` });
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log(
    "PASS: desktop/mobile create, autosave, Ctrl+S, reload, shared Page preview, publish and authoritative play; clip upload and Storage playback; AI write/rewrite/choices with accept, discard and undo, and page image generation.",
  );
} finally {
  await browser.close();
}
