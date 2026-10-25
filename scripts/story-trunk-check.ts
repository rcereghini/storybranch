import assert from "node:assert/strict";
import { launchBrowser } from "./browser";
const browser = await launchBrowser();
try {
  for (const width of [1440, 390]) {
    const tab = await browser.newPage({ viewport: { width, height: 950 } });
    const errors: string[] = [];
    tab.on("pageerror", (e) => errors.push(e.message));
    const view = async (name: "Map" | "Panel") => {
      const nav = tab.locator(".studio-views");
      if (await nav.isVisible())
        await nav
          .getByRole("button", {
            name: name === "Map" ? "Map" : /^(StoryTrunk|Edit StoryNode)$/,
          })
          .click();
    };
    const pane = async (name: "StoryTrunk" | "StoryNode") => {
      await view("Panel");
      await tab
        .locator(".studio-panel .studio-tabs")
        .getByRole("button", { name, exact: true })
        .click();
    };
    const save = async () => {
      await tab
        .getByRole("button", { name: "Save draft", exact: true })
        .click();
      await tab
        .locator(".studio-status")
        .getByText("All changes saved", { exact: true })
        .waitFor();
    };
    await tab.goto("http://127.0.0.1:5173/studio");
    await tab.getByRole("button", { name: "Sign in to create" }).click();
    await tab
      .getByRole("dialog")
      .getByRole("button", { name: "Sign in ↗" })
      .click();
    await tab.getByRole("dialog").waitFor({ state: "hidden" });
    await tab.getByRole("button", { name: "New story", exact: true }).click();
    await tab.getByText("Your Story is blank.", { exact: false }).waitFor();
    const title = `Trunk ${width} ${Date.now()}`;
    await tab.getByLabel("Story title", { exact: true }).fill(title);
    await tab
      .getByLabel("Starting keys", { exact: true })
      .fill("invitation, brass-key");
    await tab.getByLabel("Description", { exact: true }).click();
    await save();
    await tab.reload();
    await tab.getByRole("button", { name: new RegExp(title) }).click();
    await tab.getByText("Your Story is blank.", { exact: false }).waitFor();
    assert.equal(
      await tab.getByLabel("Starting keys", { exact: true }).inputValue(),
      "invitation, brass-key",
    );
    await tab.getByRole("button", { name: "Preview", exact: true }).click();
    assert.equal(await tab.locator(".studio-preview").count(), 0);
    await view("Map");
    const graph = tab.getByRole("region", { name: "Branching story timeline" });
    await graph
      .getByLabel("New timeline StoryNode type")
      .selectOption("text-options");
    await graph
      .getByRole("button", { name: "+ Add StoryNode", exact: true })
      .click();
    await pane("StoryNode");
    const opening = await tab
      .getByLabel("Edit StoryNode", { exact: true })
      .inputValue();
    await tab
      .getByLabel("StoryNode title", { exact: true })
      .fill("Choose a path");
    await view("Map");
    await graph
      .getByLabel("New timeline StoryNode type")
      .selectOption("ending");
    await graph
      .getByRole("button", { name: "+ Add StoryNode", exact: true })
      .click();
    await pane("StoryNode");
    const ending = await tab
      .getByLabel("Edit StoryNode", { exact: true })
      .inputValue();
    await tab
      .getByLabel("StoryNode title", { exact: true })
      .fill("Safe ending");
    await tab
      .getByLabel("Completion summary", { exact: true })
      .fill("You brought the harbor home.");
    await tab
      .getByRole("button", { name: "Add reward key", exact: true })
      .click();
    await tab.getByLabel("Reward 1 key", { exact: true }).fill("rescuer");
    await tab
      .getByLabel("Reward 1 label", { exact: true })
      .fill("Harbor rescuer");
    await tab
      .getByRole("button", { name: "Add reward key", exact: true })
      .click();
    await tab.getByLabel("Reward 2 key", { exact: true }).fill("invitation");
    await tab
      .getByLabel("Reward 2 label", { exact: true })
      .fill("Old invitation");
    await tab
      .getByLabel("Edit StoryNode", { exact: true })
      .selectOption(opening);
    await tab
      .getByText("Advanced conditions and effects (JSON)", { exact: true })
      .click();
    const outputs = [
      {
        id: "safe",
        label: "Finish",
        costs: [],
        unavailableDisplay: "locked",
        outcome: {
          kind: "direct",
          route: { targetStoryNodeId: ending, effects: [] },
        },
      },
      {
        id: "unfinished",
        label: "Secret unfinished route",
        costs: [],
        unavailableDisplay: "locked",
        outcome: {
          kind: "direct",
          route: { targetStoryNodeId: "missing", effects: [] },
        },
      },
    ];
    await tab.getByLabel("Outputs JSON").fill(JSON.stringify(outputs));
    await tab.getByLabel("StoryNode title", { exact: true }).click();
    await pane("StoryTrunk");
    await tab
      .getByRole("region", { name: "Publication review" })
      .getByText(/Secret unfinished route/)
      .waitFor();
    for (const theme of ["light", "dark"]) {
      await tab.evaluate(
        (t) => (document.documentElement.dataset.theme = t),
        theme,
      );
      assert(
        await tab.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await tab.screenshot({
        path: `test-results/trunk-${width}-${theme}.png`,
      });
    }
    await save();
    await tab.reload();
    await tab.getByRole("button", { name: new RegExp(title) }).click();
    await pane("StoryNode");
    await tab
      .getByLabel("Edit StoryNode", { exact: true })
      .selectOption(ending);
    assert.equal(
      await tab.getByLabel("Completion summary", { exact: true }).inputValue(),
      "You brought the harbor home.",
    );
    assert.equal(
      await tab.getByLabel("Reward 1 key", { exact: true }).inputValue(),
      "rescuer",
    );
    await tab.getByRole("button", { name: "Preview", exact: true }).click();
    const preview = tab.locator(".studio-preview");
    await preview.getByRole("heading", { name: "Choose a path" }).waitFor();
    assert.equal(
      await preview
        .getByRole("button", { name: /Secret unfinished route/ })
        .count(),
      0,
    );
    await preview.getByRole("button", { name: /Finish/ }).click();
    await preview.getByRole("heading", { name: "Safe ending" }).waitFor();
    await preview
      .getByText("Harbor rescuer — Earned", { exact: true })
      .waitFor();
    await preview
      .getByText("Old invitation — Already held", { exact: true })
      .waitFor();
    await tab.getByRole("button", { name: "Close preview" }).click();
    await tab
      .getByRole("button", { name: "Publish edition", exact: true })
      .click();
    await tab
      .getByText(/Published edition-\d+\. Your story is now in Discover\./)
      .waitFor();
    await tab
      .getByRole("button", { name: "Play published story", exact: true })
      .click();
    await tab.getByRole("heading", { name: "Choose a path" }).waitFor();
    assert.equal(
      await tab
        .getByRole("button", { name: /Secret unfinished route/ })
        .count(),
      0,
    );
    await tab.getByRole("button", { name: /Finish/ }).click();
    await tab.getByRole("heading", { name: "Safe ending" }).waitFor();
    await tab.reload();
    await tab.getByRole("heading", { name: "Safe ending" }).waitFor();
    await tab
      .getByText("You brought the harbor home.", { exact: true })
      .waitFor();
    await tab.getByText("Harbor rescuer — Earned", { exact: true }).waitFor();
    await tab
      .getByText("Old invitation — Already held", { exact: true })
      .waitFor();
    for (const theme of ["light", "dark"]) {
      await tab.evaluate(
        (t) => (document.documentElement.dataset.theme = t),
        theme,
      );
      await tab
        .getByRole("region", { name: "StoryLeaf completion" })
        .scrollIntoViewIfNeeded();
      assert(
        await tab.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await tab.screenshot({
        path: `test-results/story-leaf-${width}-${theme}.png`,
      });
    }
    assert.deepEqual(errors, []);
    await tab.close();
  }
  console.log(
    "PASS: blank StoryTrunk save/reload, starting keys, diagnostics, safe preview/publication/player completion at desktop/mobile in both themes.",
  );
} finally {
  await browser.close();
}
