import assert from "node:assert/strict";
import { launchBrowser } from "./browser";
const browser = await launchBrowser();
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
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
    const title = `Branching paths ${width} ${Date.now()}`;
    await page.getByLabel("Story title", { exact: true }).fill(title);
    const graph = page.getByRole("region", {
      name: "Branching story timeline",
    });
    await graph
      .getByRole("button", { name: "+ Add branch", exact: true })
      .click();
    await page.getByLabel("Page title", { exact: true }).fill("Forest path");
    const forestId = await page
      .getByLabel("Edit page", { exact: true })
      .inputValue();
    await page.getByLabel("Edit page", { exact: true }).selectOption("opening");
    assert.equal(
      await page.getByLabel("Page type", { exact: true }).inputValue(),
      "text-options",
    );
    await graph
      .getByRole("button", { name: "+ Add branch", exact: true })
      .click();
    await page.getByLabel("Page title", { exact: true }).fill("River path");
    const riverId = await page
      .getByLabel("Edit page", { exact: true })
      .inputValue();
    await graph
      .getByRole("button", { name: "+ Add page", exact: true })
      .click();
    await page.getByLabel("Page title", { exact: true }).fill("River crossing");
    const crossingId = await page
      .getByLabel("Edit page", { exact: true })
      .inputValue();
    await page.getByLabel("Edit page", { exact: true }).selectOption(riverId);
    assert.equal(
      await page.getByLabel("Next page", { exact: true }).inputValue(),
      crossingId,
    );
    await graph
      .getByRole("button", { name: "Arrange tree", exact: true })
      .click();
    await graph
      .getByRole("button", {
        name: "Connect Continue from Opening",
        exact: true,
      })
      .click();
    await graph
      .getByRole("button", { name: "Connect to River path", exact: true })
      .click();
    await page.getByLabel("Edit page", { exact: true }).selectOption("opening");
    assert.equal(
      await page.getByLabel("Next page", { exact: true }).first().inputValue(),
      riverId,
    );
    const card = graph.locator(`[data-page-id="${forestId}"]`);
    const handle = card.getByRole("button", {
      name: "Move Forest path",
      exact: true,
    });
    await handle.scrollIntoViewIfNeeded();
    const before = await card.evaluate((el) => ({
      x: parseFloat((el as HTMLElement).style.left),
      y: parseFloat((el as HTMLElement).style.top),
    }));
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + 50, box.y + 15);
    await page.mouse.down();
    await page.mouse.move(box.x + 90, box.y + 65, { steps: 10 });
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
    await page.getByText("Draft saved privately.", { exact: false }).waitFor();
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
    await graph.getByRole("button", { name: "Zoom out timeline" }).click();
    await graph.getByRole("button", { name: "Zoom out timeline" }).click();
    await graph.locator(".graph-viewport").evaluate((el) => {
      el.scrollLeft = 0;
      el.scrollTop = 0;
    });
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
    "PASS: branching, reconnecting, pointer/keyboard movement, persisted layout, reload and shared Page preview on desktop/mobile.",
  );
} finally {
  await browser.close();
}
