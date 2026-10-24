import assert from "node:assert/strict";
import type { Page as BrowserTab } from "playwright";
import { launchBrowser } from "./browser";

// On narrow screens the editor shows one view at a time.
export const showView = async (
  tab: BrowserTab,
  view: "StoryNodes" | "Map" | "Panel",
) => {
  const views = tab.locator(".studio-views");
  if (!(await views.isVisible())) return;
  await views
    .getByRole("button", {
      name: view === "Panel" ? /^(Edit StoryNode|Story)$/ : view,
      exact: view !== "Panel",
    })
    .click();
};
export const showPane = async (
  tab: BrowserTab,
  pane: "StoryNode" | "Story",
) => {
  await showView(tab, "Panel");
  await tab
    .locator(".studio-panel .studio-tabs")
    .getByRole("button", { name: pane, exact: true })
    .click();
};
const saved = (tab: BrowserTab) =>
  tab
    .locator(".studio-status")
    .getByText("All changes saved", { exact: true })
    .waitFor();
const signIn = async (tab: BrowserTab) => {
  await tab.goto("http://127.0.0.1:5173/studio");
  await tab.getByRole("button", { name: "Sign in to create" }).click();
  await tab.getByText("LOCAL EMULATOR ACCOUNTS").waitFor();
  await tab
    .getByRole("dialog")
    .getByRole("button", { name: "Sign in ↗" })
    .click();
  await tab.getByRole("dialog").waitFor({ state: "hidden" });
};

const browser = await launchBrowser();
try {
  for (const width of [1440, 390]) {
    const tab = await browser.newPage({ viewport: { width, height: 950 } });
    const errors: string[] = [];
    tab.on("pageerror", (e) => {
      errors.push(e.message);
      console.error(e.message);
    });
    await signIn(tab);
    await tab.getByRole("button", { name: "New story", exact: true }).click();
    const title = `Studio journey ${width} ${Date.now()}`;
    // Autosave: editing alone saves the draft, without pressing Save.
    const autosaved = tab.waitForResponse(
      (r) =>
        r.request().method() === "POST" &&
        /\/api\/studio\/[^/]+$/.test(r.url()),
    );
    await tab.getByLabel("Story title", { exact: true }).fill(title);
    assert.equal((await autosaved).status(), 200);
    await saved(tab);
    await showPane(tab, "Story");
    await tab
      .getByLabel("Description", { exact: true })
      .fill("A story created and published through Studio.");
    await showPane(tab, "StoryNode");
    await tab
      .getByLabel("StoryNode type", { exact: true })
      .selectOption("dice");
    await tab
      .getByLabel("Text / transcript", { exact: true })
      .fill("Roll to find your way home.");
    // Ctrl/Cmd+S saves straight away.
    const quick = tab.waitForResponse(
      (r) =>
        r.request().method() === "POST" &&
        /\/api\/studio\/[^/]+$/.test(r.url()),
    );
    await tab.keyboard.press("Control+s");
    const record = await (await quick).json();
    assert.equal(
      record.story.storyNodes.opening.transcript,
      "Roll to find your way home.",
    );
    await saved(tab);
    await tab.screenshot({ path: `test-results/studio-editor-${width}.png` });
    assert(
      await tab.evaluate(
        () =>
          document.documentElement.scrollWidth <= innerWidth &&
          document.documentElement.scrollHeight <= innerHeight + 1,
      ),
      "The editor fits the window without document scrolling",
    );
    await tab.reload();
    // The list has loaded once its first card shows.
    await tab.locator(".studio-draft-card").first().waitFor();
    await tab.waitForFunction(
      () => !document.querySelector(".loading-overlay"),
    );
    while (
      !(await tab.getByRole("button", { name: new RegExp(title) }).count()) &&
      (await tab
        .getByRole("button", { name: "More drafts", exact: true })
        .count())
    ) {
      const count = await tab.locator(".studio-draft-card").count();
      const nextBatch = tab.waitForResponse(
        (r) =>
          r.request().method() === "GET" &&
          r.url().includes("/api/studio?cursor="),
      );
      await tab
        .getByRole("button", { name: "More drafts", exact: true })
        .click();
      const data = await (await nextBatch).json();
      await tab.waitForFunction(
        (expected) =>
          document.querySelectorAll(".studio-draft-card").length >= expected,
        count + data.items.length,
      );
      if (!data.nextCursor) break;
    }
    await tab.getByRole("button", { name: new RegExp(title) }).click();
    await tab.locator(".studio-shell").waitFor();
    await showPane(tab, "StoryNode");
    assert.equal(
      await tab.getByLabel("StoryNode type", { exact: true }).inputValue(),
      "dice",
    );
    await tab.getByRole("button", { name: "Preview", exact: true }).click();
    await tab
      .locator(".studio-preview")
      .getByRole("button", { name: /Roll d20/ })
      .click();
    await tab.locator(".dice-face").getByText("20", { exact: true }).waitFor();
    await tab
      .locator(".studio-preview")
      .getByRole("button", { name: /Next/ })
      .click();
    await tab
      .locator(".studio-preview")
      .getByRole("heading", { name: "The end" })
      .waitFor();
    await tab.getByRole("button", { name: "Close preview" }).click();
    await tab
      .getByRole("button", { name: "Publish edition", exact: true })
      .click();
    await tab
      // Editions are numbered by the saved revision they publish.
      .getByText(/Published edition-\d+\. Your story is now in Discover\./)
      .waitFor();
    await tab.waitForFunction(
      () => !document.querySelector(".loading-overlay"),
    );
    assert(
      await tab.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await tab.getByRole("button", { name: "Play published story" }).click();
    await tab.getByRole("heading", { name: "Opening", exact: true }).waitFor();
    await tab.getByRole("button", { name: /Roll d20/ }).click();
    await tab
      .locator(".dice-face")
      .getByText("You rolled", { exact: true })
      .waitFor();
    await tab.getByRole("button", { name: /Next/ }).click();
    await tab.getByRole("heading", { name: "The end" }).waitFor();
    assert.deepEqual(errors, []);
    await tab.close();
  }

  // Upload a clip, preview it, publish and play it from Storage.
  {
    const tab = await browser.newPage({
      viewport: { width: 1440, height: 950 },
    });
    const errors: string[] = [];
    tab.on("pageerror", (e) => errors.push(e.message));
    await signIn(tab);
    await tab.getByRole("button", { name: "New story", exact: true }).click();
    await tab
      .getByLabel("Story title", { exact: true })
      .fill(`Uploaded clip ${Date.now()}`);
    await tab
      .getByLabel("StoryNode type", { exact: true })
      .selectOption("video");
    await tab
      .getByLabel("Upload a clip", { exact: true })
      .setInputFiles("apps/web/public/media/harbor-landscape-audio-v1.mp4");
    await tab
      .getByText("Uploaded harbor-landscape-audio-v1.mp4", { exact: false })
      .waitFor({ timeout: 30000 });
    assert.match(
      await tab.getByLabel("Video clip", { exact: true }).inputValue(),
      /^asset:/,
    );
    await tab.getByRole("button", { name: "Save draft", exact: true }).click();
    await saved(tab);
    const storageSource = (scope: string) =>
      tab.waitForFunction(
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
    await tab.getByRole("button", { name: "Preview", exact: true }).click();
    await storageSource(".studio-preview");
    await tab.getByRole("button", { name: "Close preview" }).click();
    await tab
      .getByRole("button", { name: "Publish edition", exact: true })
      .click();
    await tab.getByText(/Published edition-\d+\./).waitFor();
    await tab.waitForFunction(
      () => !document.querySelector(".loading-overlay"),
    );
    await tab.getByRole("button", { name: "Play published story" }).click();
    await storageSource(".scene-player");
    assert.deepEqual(errors, []);
    await tab.close();
  }

  // AI help, with the model and the image provider faked in the browser:
  // suggestions cover the text field and change nothing until accepted.
  for (const width of [1440, 390]) {
    const tab = await browser.newPage({ viewport: { width, height: 950 } });
    const errors: string[] = [];
    tab.on("pageerror", (e) => errors.push(e.message));
    await tab.route("**/api/profile", async (route) => {
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
    await tab.route("**/api/assist", async (route) => {
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
    await tab.route("**/api/generation**", async (route) => {
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
    await signIn(tab);
    await tab.getByRole("button", { name: "New story", exact: true }).click();
    await tab
      .getByLabel("Story title", { exact: true })
      .fill(`AI help ${width}`);
    await showPane(tab, "StoryNode");
    const text = tab.getByLabel("Text / transcript", { exact: true });
    const field = await text.boundingBox();
    await tab.getByRole("button", { name: "✦ Write it" }).click();
    const suggestion = tab.getByRole("region", { name: "AI suggestion" });
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
      asked[0].storyNode.text,
      "",
      "The placeholder is not sent as StoryNode text",
    );
    await suggestion.getByRole("button", { name: "Use this text" }).click();
    assert.equal(await text.inputValue(), "Rain needles the harbor.");
    await tab
      .getByLabel("Rewrite style")
      .selectOption({ label: "More suspense" });
    await tab.getByRole("button", { name: "✦ Rewrite" }).click();
    await suggestion.getByText("Rain. The harbor waits.").waitFor();
    assert.equal(asked[1].instruction, "more suspense");
    await suggestion.getByRole("button", { name: "Discard" }).click();
    assert.equal(await text.inputValue(), "Rain needles the harbor.");
    await tab.getByRole("button", { name: "✦ Suggest choices" }).click();
    await suggestion.getByRole("button", { name: "Add these choices" }).click();
    assert.equal(
      await tab.getByLabel("StoryNode type", { exact: true }).inputValue(),
      "text-options",
    );
    assert.equal(
      await tab.getByLabel("Option 1 label").inputValue(),
      "Follow the lantern",
    );
    assert.equal(
      await tab.getByLabel("Option 2 label").inputValue(),
      "Hide in the boat",
    );
    await showView(tab, "StoryNodes");
    await tab
      .locator(".story-outline strong", { hasText: /^The lantern$/ })
      .waitFor();
    // Undo reverses the whole accepted suggestion (narrow screens hide undo).
    if (width === 1440) {
      await tab.locator(".studio-bar").click({ position: { x: 600, y: 20 } });
      await tab.getByRole("button", { name: "Undo" }).click();
      assert.equal(
        await tab
          .locator(".story-outline strong", { hasText: /^The lantern$/ })
          .count(),
        0,
      );
      await tab.getByRole("button", { name: "Redo" }).click();
      await tab
        .locator(".story-outline strong", { hasText: /^The lantern$/ })
        .waitFor();
    }
    // StoryNode image: AI writes the prompt, then the generated image is attached.
    await showPane(tab, "StoryNode");
    await tab
      .getByRole("button", { name: "✦ Generate a StoryNode image" })
      .click();
    const dialog = tab.getByRole("dialog", {
      name: "Generate a StoryNode image",
    });
    await dialog
      .getByRole("button", { name: "✦ Write the prompt with AI" })
      .click();
    await tab.waitForFunction(() =>
      document
        .querySelector<HTMLTextAreaElement>('[role="dialog"] textarea')
        ?.value.startsWith("A rain-soaked harbor"),
    );
    await dialog.getByRole("button", { name: "Portrait" }).click();
    await tab.screenshot({
      path: `test-results/studio-image-dialog-${width}.png`,
    });
    await dialog
      .getByRole("button", { name: "Generate image", exact: true })
      .click();
    await dialog.waitFor({ state: "hidden" });
    assert.equal(generated[0].aspect, "9:16");
    assert.equal(generated[0].quality, "draft");
    assert.equal(
      await tab.getByLabel("StoryNode photo", { exact: true }).inputValue(),
      "asset:generated-test",
    );
    await tab.screenshot({ path: `test-results/studio-ai-${width}.png` });
    assert.deepEqual(errors, []);
    await tab.close();
  }
  console.log(
    "PASS: desktop/mobile create, autosave, Ctrl+S, reload, shared StoryNode preview, publish and authoritative play; clip upload and Storage playback; AI write/rewrite/choices with accept, discard and undo, and StoryNode image generation.",
  );
} finally {
  await browser.close();
}
