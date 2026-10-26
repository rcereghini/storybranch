import assert from "node:assert/strict";
import { launchBrowser } from "./browser";
import type { Page as BrowserTab } from "playwright";
// Narrow screens show one editor view at a time.
const show = async (tab: BrowserTab, view: "Map" | "Panel") => {
  const views = tab.locator(".studio-views");
  if (await views.isVisible())
    await views
      .getByRole("button", {
        name: view === "Map" ? "Map" : /^(Edit StoryNode|StoryTrunk)$/,
      })
      .click();
};
const browser = await launchBrowser();
try {
  for (const width of [1440, 390]) {
    const tab = await browser.newPage({ viewport: { width, height: 1000 } });
    const errors: string[] = [];
    tab.setDefaultTimeout(20000);
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
    const title = `Branching paths ${width} ${Date.now()}`;
    await tab.getByLabel("Story title", { exact: true }).fill(title);
    const graph = tab.getByRole("region", {
      name: "Branching story timeline",
    });
    await show(tab, "Map");
    for (const viewportWidth of width === 1440 ? [1440, 1920, 2560] : [390]) {
      await tab.setViewportSize({ width: viewportWidth, height: 1000 });
      for (const theme of ["light", "dark"]) {
        await tab.evaluate((value) => {
          document.documentElement.dataset.theme = value;
        }, theme);
        const bounds = await tab.locator(".studio-shell").boundingBox();
        assert(bounds);
        assert.equal(bounds.x, 0);
        assert.equal(bounds.width, viewportWidth);
        assert(
          await tab.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        );
      }
    }
    await tab.setViewportSize({ width, height: 1000 });
    // Undo removes an added StoryNode; redo brings it back.
    if (width === 1440) {
      await graph
        .getByRole("button", { name: "+ Add StoryNode", exact: true })
        .click();
      assert.equal(await graph.locator(".graph-card").count(), 3);
      await tab.getByRole("button", { name: "Undo" }).click();
      assert.equal(await graph.locator(".graph-card").count(), 2);
      await tab.getByRole("button", { name: "Redo" }).click();
      assert.equal(await graph.locator(".graph-card").count(), 3);
      await tab.getByRole("button", { name: "Undo" }).click();
    }
    await graph
      .getByRole("button", { name: "+ Add branch", exact: true })
      .click();
    await show(tab, "Panel");
    await tab
      .getByLabel("StoryNode title", { exact: true })
      .fill("Forest path");
    const forestId = await tab
      .getByLabel("Edit StoryNode", { exact: true })
      .inputValue();
    await tab
      .getByLabel("Edit StoryNode", { exact: true })
      .selectOption("opening");
    assert.equal(
      await tab.getByLabel("StoryNode type", { exact: true }).inputValue(),
      "text-options",
    );
    await show(tab, "Map");
    await graph
      .getByRole("button", { name: "+ Add branch", exact: true })
      .click();
    await show(tab, "Panel");
    await tab.getByLabel("StoryNode title", { exact: true }).fill("River path");
    const riverId = await tab
      .getByLabel("Edit StoryNode", { exact: true })
      .inputValue();
    await show(tab, "Map");
    await graph
      .getByRole("button", { name: "+ Add StoryNode", exact: true })
      .click();
    await show(tab, "Panel");
    await tab
      .getByLabel("StoryNode title", { exact: true })
      .fill("River crossing");
    const crossingId = await tab
      .getByLabel("Edit StoryNode", { exact: true })
      .inputValue();
    await tab
      .getByLabel("Edit StoryNode", { exact: true })
      .selectOption(riverId);
    assert.equal(
      await tab.getByLabel("Next", { exact: true }).inputValue(),
      crossingId,
    );
    await show(tab, "Map");
    await graph
      .getByRole("button", { name: "Arrange tree", exact: true })
      .click();
    await graph.getByRole("button", { name: "Fit", exact: true }).click();
    await graph
      .getByRole("button", {
        name: "Connect Continue from Opening",
        exact: true,
      })
      .click();
    await graph
      .getByRole("button", { name: "Connect to River path", exact: true })
      .click();
    await show(tab, "Panel");
    await tab
      .getByLabel("Edit StoryNode", { exact: true })
      .selectOption("opening");
    assert.equal(
      await tab.getByLabel("Next", { exact: true }).first().inputValue(),
      riverId,
    );
    // Center the Forest path card on the map, then drag it by its handle.
    await tab
      .getByLabel("Edit StoryNode", { exact: true })
      .selectOption(forestId);
    await show(tab, "Map");
    for (let i = 0; i < 6; i++)
      await graph.getByRole("button", { name: "Zoom in timeline" }).click();
    await graph.getByRole("button", { name: "Find selected" }).click();
    const card = graph.locator(`[data-story-node-id="${forestId}"]`);
    const handle = card.getByRole("button", {
      name: "Move Forest path",
      exact: true,
    });
    const before = await card.evaluate((el) => ({
      x: parseFloat((el as HTMLElement).style.left),
      y: parseFloat((el as HTMLElement).style.top),
    }));
    const box = (await handle.boundingBox())!;
    await tab.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await tab.mouse.down();
    await tab.mouse.move(
      box.x + box.width / 2 + 40,
      box.y + box.height / 2 + 50,
      {
        steps: 10,
      },
    );
    await tab.mouse.up();
    await handle.focus();
    await tab.keyboard.press("ArrowRight");
    const after = await card.evaluate((el) => ({
      x: parseFloat((el as HTMLElement).style.left),
      y: parseFloat((el as HTMLElement).style.top),
    }));
    assert(after.x > before.x && after.y > before.y);
    const saved = tab.waitForResponse(
      (r) =>
        r.request().method() === "POST" &&
        /\/api\/studio\/[^/]+$/.test(r.url()),
    );
    await tab.getByRole("button", { name: "Save draft", exact: true }).click();
    const record = await (await saved).json();
    assert.deepEqual(record.storyNodePositions[forestId], after);
    await tab
      .locator(".studio-status")
      .getByText("All changes saved", { exact: true })
      .waitFor();
    // Dragging the background pans the canvas; card positions don't change.
    const canvas = graph.locator(".graph-canvas");
    await graph.getByRole("button", { name: "Fit", exact: true }).click();
    const panned = await canvas.evaluate(
      (el) => (el as HTMLElement).style.transform,
    );
    // Find an empty spot on the canvas to drag from.
    const spot = await graph.locator(".graph-viewport").evaluate((el) => {
      const r = el.getBoundingClientRect();
      for (let y = r.top + r.height * 0.3; y < r.bottom - 80; y += 20)
        for (let x = r.left + 10; x < r.right - 10; x += 20) {
          const hit = document.elementFromPoint(x, y);
          if (hit === el || hit?.classList.contains("graph-canvas"))
            return { x, y };
        }
      return null;
    });
    assert(spot, "The canvas has an empty spot");
    await tab.mouse.move(spot.x, spot.y);
    await tab.mouse.down();
    await tab.mouse.move(spot.x + 60, spot.y + 40, { steps: 6 });
    await tab.mouse.up();
    assert.notEqual(
      await canvas.evaluate((el) => (el as HTMLElement).style.transform),
      panned,
    );
    assert.deepEqual(
      await card.evaluate((el) => ({
        x: parseFloat((el as HTMLElement).style.left),
        y: parseFloat((el as HTMLElement).style.top),
      })),
      after,
    );
    await tab.reload();
    // Draft listings are paginated; open this exact saved record through a scoped fixture response.
    await tab.route("**/api/studio", (route) =>
      route.fulfill({
        json: {
          canPublish: true,
          uid: "player",
          nextCursor: null,
          items: [
            {
              id: record.story.id,
              title,
              revision: record.revision,
              publishedVersionId: null,
            },
          ],
        },
      }),
    );
    await tab.reload();
    await tab.getByRole("button", { name: new RegExp(title) }).click();
    await tab.getByLabel("Description", { exact: true }).waitFor();
    await show(tab, "Map");
    const restored = await graph
      .locator(`[data-story-node-id="${forestId}"]`)
      .evaluate((el) => ({
        x: parseFloat((el as HTMLElement).style.left),
        y: parseFloat((el as HTMLElement).style.top),
      }));
    assert.deepEqual(restored, after);
    await show(tab, "Map");
    await graph.getByRole("button", { name: "Fit", exact: true }).click();
    await graph.screenshot({ path: `test-results/story-graph-${width}.png` });
    assert(
      await tab.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await tab.getByRole("button", { name: "Preview", exact: true }).click();
    await tab
      .locator(".studio-preview")
      .getByRole("button", { name: /01.*Continue/ })
      .click();
    await tab
      .locator(".studio-preview")
      .getByRole("heading", { name: "River path", exact: true })
      .waitFor();
    assert.deepEqual(errors, []);
    await tab.close();
  }
  console.log(
    "PASS: branching, undo/redo, reconnecting, pointer/keyboard movement, canvas pan, fit and zoom, persisted layout, reload and shared StoryNode preview on desktop/mobile.",
  );
} finally {
  await browser.close();
}
