import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { starterStory } from "../apps/web/src/studio-model";
import { launchBrowser } from "./browser";

// Emulator-only fixture setup through the same authenticated authoring API.
const authResponse = await fetch(
  "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key",
  {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "player@storybranch.test",
      password: "HarborDemo123!",
      returnSecureToken: true,
    }),
  },
);
assert(authResponse.ok);
const { idToken } = await authResponse.json();
async function api(path: string, body?: unknown) {
  const response = await fetch(`http://127.0.0.1:5173/api${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      authorization: `Bearer ${idToken}`,
      "content-type": "application/json",
      "X-Story-Player": "player-view-v1",
      "X-Story-Contract": "story-nodes-v1",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  assert.equal(response.status, 200, JSON.stringify(data));
  return data;
}

const browser = await launchBrowser();
try {
  for (const width of [1440, 390]) {
    const story = starterStory(`items-${randomUUID()}`);
    story.title = `Item editor ${width} ${Date.now()}`;
    const opening = story.storyNodes.opening;
    const safe = structuredClone(opening.choices[0]);
    opening.storyNodeType = "text-options";
    opening.choices[0].label = "Safe exit";
    story.storyNodes.middle = {
      ...structuredClone(opening),
      id: "middle",
      title: "Inventory checkpoint",
      choices: [
        structuredClone(safe),
        { ...structuredClone(safe), id: "spend", label: "Spend relic" },
      ],
    };
    opening.choices.push({
      ...structuredClone(safe),
      id: "earn",
      label: "Earn relic",
      outcome: {
        kind: "direct",
        route: {
          targetStoryNodeId: "middle",
          effects: [
            {
              id: "score",
              kind: "score",
              scoreId: `${story.id}:score`,
              delta: 1,
            },
          ],
        },
      },
    });
    await api(`/studio/${story.id}`, {
      idempotencyKey: randomUUID(),
      expectedRevision: 0,
      draft: { story, description: "Item editor test" },
    });
    const tab = await browser.newPage({ viewport: { width, height: 950 } });
    const errors: string[] = [];
    tab.on("pageerror", (e) => errors.push(e.message));
    await tab.route("**/api/studio", (route) =>
      route.fulfill({
        json: {
          canPublish: true,
          items: [
            {
              id: story.id,
              title: story.title,
              revision: 1,
              publishedVersionId: null,
            },
          ],
          nextCursor: null,
        },
      }),
    );
    await tab.goto("http://127.0.0.1:5173/studio");
    await tab.getByRole("button", { name: "Sign in to create" }).click();
    await tab
      .getByRole("dialog")
      .getByRole("button", { name: "Sign in ↗" })
      .click();
    await tab.getByRole("dialog").waitFor({ state: "hidden" });
    const open = async () => {
      await tab.getByRole("button", { name: new RegExp(story.title) }).click();
      if (await tab.locator(".studio-views").isVisible())
        await tab
          .locator(".studio-views")
          .getByRole("button", { name: /^(StoryTrunk|Edit StoryNode)$/ })
          .click();
      await tab
        .locator(".studio-panel .studio-tabs")
        .getByRole("button", { name: "StoryNode", exact: true })
        .click();
      await tab
        .getByLabel("Edit StoryNode", { exact: true })
        .selectOption("opening");
    };
    await open();
    await tab.getByText("Edit option 2 items", { exact: true }).click();
    const editor = tab.getByRole("region", {
      name: "Option 2 items",
      exact: true,
    });
    await editor
      .getByRole("button", { name: "Add Selected route reward", exact: true })
      .click();
    await editor
      .getByLabel("Selected route effect 2 item ID", { exact: true })
      .fill("foreign:relic");
    const apply = editor.getByRole("button", {
      name: "Apply item edits",
      exact: true,
    });
    assert(await apply.isDisabled());
    await editor
      .getByLabel("Selected route effect 2 item ID", { exact: true })
      .fill(`${story.id}:relic`);
    await editor
      .getByLabel("Selected route effect 2 change", { exact: true })
      .fill("100");
    assert(await apply.isDisabled());
    await editor
      .getByLabel("Selected route effect 2 change", { exact: true })
      .fill("2");
    await apply.click();
    await editor
      .getByLabel("Selected route effect 2 change", { exact: true })
      .fill("3");
    await editor
      .getByRole("button", { name: "Reset item edits", exact: true })
      .click();
    assert.equal(
      await editor
        .getByLabel("Selected route effect 2 change", { exact: true })
        .inputValue(),
      "2",
    );
    await tab
      .getByLabel("Edit StoryNode", { exact: true })
      .selectOption("middle");
    await tab.getByText("Edit option 2 items", { exact: true }).click();
    await editor
      .getByRole("button", { name: "Add item cost", exact: true })
      .click();
    await editor
      .getByLabel("Cost 1 existing item", { exact: true })
      .selectOption(`${story.id}:relic`);
    await apply.click();
    await tab
      .locator(".studio-panel .studio-tabs")
      .getByRole("button", { name: "StoryTrunk", exact: true })
      .click();
    const catalogue = tab.getByRole("region", {
      name: "Story item catalogue",
      exact: true,
    });
    await catalogue
      .getByRole("button", {
        name: "Describe " + story.id + ":relic",
        exact: true,
      })
      .click();
    const name = catalogue.getByLabel("Item " + story.id + ":relic name", {
      exact: true,
    });
    await name.fill("Golden relic");
    await catalogue
      .getByLabel("Item " + story.id + ":relic description", { exact: true })
      .fill("Found on the first route.");
    assert(
      await catalogue
        .getByRole("button", {
          name: "Remove " + story.id + ":relic",
          exact: true,
        })
        .isDisabled(),
    );
    await catalogue.getByText("Where used (2)", { exact: true }).click();
    assert.match(await catalogue.innerText(), /Earn relic/);
    assert.match(await catalogue.innerText(), /Spend relic/);
    await catalogue
      .getByLabel("New item ID suffix", { exact: true })
      .fill("unused");
    await catalogue
      .getByRole("button", { name: "Add catalogue item", exact: true })
      .click();
    await catalogue
      .getByRole("button", {
        name: "Remove " + story.id + ":unused",
        exact: true,
      })
      .click();
    await catalogue
      .getByRole("button", { name: "Apply catalogue", exact: true })
      .click();
    await name.fill("Unapplied name");
    await catalogue
      .getByRole("button", { name: "Reset catalogue", exact: true })
      .click();
    assert.equal(await name.inputValue(), "Golden relic");
    for (const theme of ["light", "dark"]) {
      await tab.evaluate((t) => {
        document.documentElement.dataset.theme = t;
      }, theme);
      await name.scrollIntoViewIfNeeded();
      assert(
        await tab.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await tab.screenshot({
        path: "test-results/item-catalogue-" + width + "-" + theme + ".png",
        animations: "disabled",
      });
    }
    await tab
      .locator(".studio-panel .studio-tabs")
      .getByRole("button", { name: "StoryNode", exact: true })
      .click();
    await tab
      .getByLabel("Edit StoryNode", { exact: true })
      .selectOption("middle");
    await tab.getByText("Edit option 2 items", { exact: true }).click();
    assert.match(
      await editor
        .getByLabel("Cost 1 existing item", { exact: true })
        .innerText(),
      /Golden relic/,
    );
    await tab.getByText("Build option 2 conditions", { exact: true }).click();
    const conditions = tab.getByRole("region", {
      name: "Option 2 condition builder",
      exact: true,
    });
    await conditions
      .getByRole("button", { name: "Add condition", exact: true })
      .click();
    await conditions
      .getByLabel("Condition 1 match", { exact: true })
      .selectOption("item");
    await conditions
      .getByLabel("Condition 1 existing item", { exact: true })
      .selectOption(story.id + ":relic");
    assert.match(
      await conditions
        .getByLabel("Condition 1 existing item", { exact: true })
        .innerText(),
      /Golden relic/,
    );
    await conditions
      .getByRole("button", { name: "Reset condition edits", exact: true })
      .click();
    for (const theme of ["light", "dark"]) {
      await tab.evaluate((t) => {
        document.documentElement.dataset.theme = t;
      }, theme);
      await editor.scrollIntoViewIfNeeded();
      assert(
        await tab.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await tab.screenshot({
        path: `test-results/branch-items-${width}-${theme}.png`,
        animations: "disabled",
      });
    }
    await tab.getByRole("button", { name: "Save draft", exact: true }).click();
    await tab
      .locator(".studio-status")
      .getByText("All changes saved", { exact: true })
      .waitFor();
    const saved = await api(`/studio/${story.id}`);
    assert.equal(saved.story.itemCatalogue.items[0].name, "Golden relic");
    assert.deepEqual(
      saved.story.storyNodes.opening.choices[1].outcome.route.effects[0],
      opening.choices[1].outcome.kind === "direct"
        ? opening.choices[1].outcome.route.effects[0]
        : null,
    );
    assert.equal(
      saved.story.storyNodes.opening.choices[1].outcome.route.effects[1].delta,
      2,
    );
    assert.equal(saved.story.storyNodes.middle.choices[1].costs[0].quantity, 1);
    await tab.reload();
    await open();
    await tab.getByRole("button", { name: "Preview", exact: true }).click();
    const preview = tab.getByRole("dialog", { name: "Private preview" });
    await preview
      .getByText("Test stats and inventory", { exact: true })
      .click();
    assert.match(
      await preview.locator(".preview-state-editor").innerText(),
      /Golden relic/,
    );
    await preview.getByText("Why these options?", { exact: true }).click();
    assert.match(
      await preview
        .getByRole("list", { name: "Preview option diagnostics", exact: true })
        .innerText(),
      /grant 2 .* if this route is taken/,
    );
    await preview.getByRole("button", { name: /Earn relic/ }).click();
    await preview
      .getByRole("heading", { name: "Inventory checkpoint", exact: true })
      .waitFor();
    assert.match(
      await preview
        .getByRole("list", { name: "Preview option diagnostics", exact: true })
        .innerText(),
      /need 1, have 2/,
    );
    await preview.getByRole("button", { name: /Spend relic/ }).click();
    await preview
      .getByRole("heading", { name: "The end", exact: true })
      .waitFor();
    await preview.getByRole("button", { name: "Close preview" }).click();
    await tab
      .getByRole("button", { name: "Publish edition", exact: true })
      .click();
    await tab
      .getByText(/Published edition-\d+\. Your story is now in Discover\./)
      .waitFor();
    assert.deepEqual(errors, []);
    await tab.close();
  }
  console.log(
    "PASS: item picker, bounds, reward/cost editing, reset, persistence, non-item preservation, earn/spend preview and publication at desktop/mobile.",
  );
} finally {
  await browser.close();
}
