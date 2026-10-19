import assert from "node:assert/strict";
import { launchBrowser } from "./browser";
import type { Page } from "playwright";
// Narrow screens show one editor view at a time.
const show = async (page: Page, view: "Map" | "Panel") => {
  const views = page.locator(".studio-views");
  if (await views.isVisible())
    await views
      .getByRole("button", {
        name: view === "Map" ? "Map" : /Edit page|Story/,
      })
      .click();
};
const browser = await launchBrowser();
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    const errors: string[] = [];
    page.setDefaultTimeout(20000);
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://127.0.0.1:5173/studio");
    await page.getByRole("button", { name: "Sign in to create" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Sign in ↗" })
      .click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "New story", exact: true }).click();
    const title = `Branching paths ${width} ${Date.now()}`;
    await page.getByLabel("Story title", { exact: true }).fill(title);
    const graph = page.getByRole("region", {
      name: "Branching story timeline",
    });
    await show(page, "Map");
    // Undo removes an added page; redo brings it back.
    if (width === 1440) {
      await graph
        .getByRole("button", { name: "+ Add page", exact: true })
        .click();
      assert.equal(await graph.locator(".graph-card").count(), 3);
      await page.getByRole("button", { name: "Undo" }).click();
      assert.equal(await graph.locator(".graph-card").count(), 2);
      await page.getByRole("button", { name: "Redo" }).click();
      assert.equal(await graph.locator(".graph-card").count(), 3);
      await page.getByRole("button", { name: "Undo" }).click();
    }
    await graph
      .getByRole("button", { name: "+ Add branch", exact: true })
      .click();
    await show(page, "Panel");
    await page.getByLabel("Page title", { exact: true }).fill("Forest path");
    const forestId = await page
      .getByLabel("Edit page", { exact: true })
      .inputValue();
    await page.getByLabel("Edit page", { exact: true }).selectOption("opening");
    assert.equal(
      await page.getByLabel("Page type", { exact: true }).inputValue(),
      "text-options",
    );
    await show(page, "Map");
    await graph
      .getByRole("button", { name: "+ Add branch", exact: true })
      .click();
    await show(page, "Panel");
    await page.getByLabel("Page title", { exact: true }).fill("River path");
    const riverId = await page
      .getByLabel("Edit page", { exact: true })
      .inputValue();
    await show(page, "Map");
    await graph
      .getByRole("button", { name: "+ Add page", exact: true })
      .click();
    await show(page, "Panel");
    await page.getByLabel("Page title", { exact: true }).fill("River crossing");
    const crossingId = await page
      .getByLabel("Edit page", { exact: true })
      .inputValue();
    await page.getByLabel("Edit page", { exact: true }).selectOption(riverId);
    assert.equal(
      await page.getByLabel("Next page", { exact: true }).inputValue(),
      crossingId,
    );
    await show(page, "Map");
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
    await show(page, "Panel");
    await page.getByLabel("Edit page", { exact: true }).selectOption("opening");
    assert.equal(
      await page.getByLabel("Next page", { exact: true }).first().inputValue(),
      riverId,
    );
    // Center the Forest path card on the map, then drag it by its handle.
    await page.getByLabel("Edit page", { exact: true }).selectOption(forestId);
    await show(page, "Map");
    for (let i = 0; i < 6; i++)
      await graph.getByRole("button", { name: "Zoom in timeline" }).click();
    await graph.getByRole("button", { name: "Find selected" }).click();
    const card = graph.locator(`[data-page-id="${forestId}"]`);
    const handle = card.getByRole("button", {
      name: "Move Forest path",
      exact: true,
    });
    const before = await card.evaluate((el) => ({
      x: parseFloat((el as HTMLElement).style.left),
      y: parseFloat((el as HTMLElement).style.top),
    }));
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width / 2 + 40,
      box.y + box.height / 2 + 50,
      {
        steps: 10,
      },
    );
    await page.mouse.up();
    await handle.focus();
    await page.keyboard.press("ArrowRight");
    const after = await card.evaluate((el) => ({
      x: parseFloat((el as HTMLElement).style.left),
      y: parseFloat((el as HTMLElement).style.top),
    }));
    assert(after.x > before.x && after.y > before.y);
    const saved = page.waitForResponse(
      (r) =>
        r.request().method() === "POST" &&
        /\/api\/studio\/[^/]+$/.test(r.url()),
    );
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    const record = await (await saved).json();
    assert.deepEqual(record.pagePositions[forestId], after);
    await page
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
    await page.mouse.move(spot.x, spot.y);
    await page.mouse.down();
    await page.mouse.move(spot.x + 60, spot.y + 40, { steps: 6 });
    await page.mouse.up();
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
    await page.reload();
    // Draft listings are paginated; open this exact saved record through a scoped fixture response.
    await page.route("**/api/studio", (route) =>
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
    await page.reload();
    await page.getByRole("button", { name: new RegExp(title) }).click();
    const restored = await graph
      .locator(`[data-page-id="${forestId}"]`)
      .evaluate((el) => ({
        x: parseFloat((el as HTMLElement).style.left),
        y: parseFloat((el as HTMLElement).style.top),
      }));
    assert.deepEqual(restored, after);
    await show(page, "Map");
    await graph.getByRole("button", { name: "Fit", exact: true }).click();
    await graph.screenshot({ path: `test-results/story-graph-${width}.png` });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await page
      .locator(".studio-preview")
      .getByRole("button", { name: /01.*Continue/ })
      .click();
    await page
      .locator(".studio-preview")
      .getByRole("heading", { name: "River path", exact: true })
      .waitFor();
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log(
    "PASS: branching, undo/redo, reconnecting, pointer/keyboard movement, canvas pan, fit and zoom, persisted layout, reload and shared Page preview on desktop/mobile.",
  );
} finally {
  await browser.close();
}
