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
    const story = starterStory(`conditions-${randomUUID()}`);
    story.title = `Condition builder ${width} ${Date.now()}`;
    story.trunkContext = { version: 1, initialKeys: [`${story.id}:local`] };
    story.progression = {
      version: 1,
      keys: [{ keyId: `${story.id}:hero`, label: "Hero", afterCompletions: 1 }],
    };
    const opening = story.storyNodes.opening;
    opening.storyNodeType = "text-options";
    opening.choices[0].label = "Safe exit";
    const mixed = {
      kind: "roll" as const,
      storyNodeId: "opening",
      op: "gte" as const,
      value: 5,
    };
    opening.choices.push(
      {
        ...structuredClone(opening.choices[0]),
        id: "composite",
        label: "Composite exit",
      },
      {
        ...structuredClone(opening.choices[0]),
        id: "advanced",
        label: "Advanced exit",
        availableWhen: mixed,
      },
    );
    await api(`/studio/${story.id}`, {
      idempotencyKey: randomUUID(),
      expectedRevision: 0,
      draft: { story, description: "Visual conditions fixture" },
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
    await tab.getByText("Build option 3 conditions", { exact: true }).click();
    const unsupported = tab.getByRole("region", {
      name: "Option 3 condition builder",
    });
    await unsupported.getByText(/includes roll/).waitFor();
    assert.equal(await unsupported.getByRole("button").count(), 0);
    await tab.getByText("Build option 2 conditions", { exact: true }).click();
    const editor = tab.getByRole("region", {
      name: "Option 2 condition builder",
    });
    await editor
      .getByRole("button", { name: "Add condition", exact: true })
      .click();
    await editor
      .getByLabel("Condition 1 match", { exact: true })
      .selectOption("any");
    await editor
      .getByLabel("Condition 1.1 match", { exact: true })
      .selectOption("all");
    await editor
      .getByLabel("Condition 1.1.1 key", { exact: true })
      .selectOption(`run|${story.id}:local`);
    await editor
      .getByRole("button", { name: "Add condition to 1.1", exact: true })
      .click();
    await editor
      .getByLabel("Condition 1.1.2 key", { exact: true })
      .selectOption(`story|${story.id}:hero`);
    await editor
      .getByRole("button", { name: "Add condition to 1", exact: true })
      .click();
    await editor
      .getByLabel("Condition 1.2 match", { exact: true })
      .selectOption("not");
    await editor
      .getByLabel("Condition 1.2.1 key", { exact: true })
      .selectOption(`run|${story.id}:local`);
    // Before Apply, preview still uses the authored unconditional option.
    await editor
      .getByRole("button", { name: "Add condition to 1.1", exact: true })
      .click();
    await editor
      .getByLabel("Condition 1.1.3 match", { exact: true })
      .selectOption("stat");
    await editor
      .getByLabel("Condition 1.1.3 threshold", { exact: true })
      .fill("");
    assert(
      await editor
        .getByRole("button", { name: "Apply condition", exact: true })
        .isDisabled(),
    );
    await editor
      .getByLabel("Condition 1.1.3 threshold", { exact: true })
      .fill("5");
    await editor
      .getByRole("button", { name: "Add condition to 1.1", exact: true })
      .click();
    await editor
      .getByLabel("Condition 1.1.4 match", { exact: true })
      .selectOption("item");
    await editor
      .getByLabel("Condition 1.1.4 item", { exact: true })
      .fill("foreign:relic");
    assert(
      await editor
        .getByRole("button", { name: "Apply condition", exact: true })
        .isDisabled(),
    );
    await editor
      .getByLabel("Condition 1.1.4 item", { exact: true })
      .fill(story.id + ":relic");
    await editor
      .getByLabel("Condition 1.1.4 comparison", { exact: true })
      .selectOption("eq");
    await editor
      .getByLabel("Condition 1.1.4 threshold", { exact: true })
      .fill("0");
    assert.match(
      await editor.getByLabel("Condition summary").innerText(),
      /agility at least 5/,
    );
    assert.match(
      await editor.getByLabel("Condition summary").innerText(),
      /quantity exactly 0/,
    );
    await tab.getByRole("button", { name: "Preview", exact: true }).click();
    const preview = tab.getByRole("dialog", { name: "Private preview" });
    await preview.getByRole("button", { name: /Composite exit/ }).waitFor();
    await preview.getByRole("button", { name: "Close preview" }).click();
    await editor
      .getByRole("button", { name: "Apply condition", exact: true })
      .click();
    await editor
      .getByRole("button", { name: "Clear condition", exact: true })
      .click();
    await editor
      .getByRole("button", { name: "Reset condition edits", exact: true })
      .click();
    assert.equal(
      await editor
        .getByLabel("Condition 1 match", { exact: true })
        .inputValue(),
      "any",
    );
    for (const theme of ["light", "dark"]) {
      await tab.evaluate((t) => {
        document.documentElement.dataset.theme = t;
      }, theme);
      await editor
        .getByLabel("Condition 1.1.4 item", { exact: true })
        .scrollIntoViewIfNeeded();
      assert(
        await tab.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await tab.screenshot({
        path: `test-results/key-conditions-${width}-${theme}.png`,
        animations: "disabled",
      });
    }
    await tab.getByRole("button", { name: "Save draft", exact: true }).click();
    await tab
      .locator(".studio-status")
      .getByText("All changes saved", { exact: true })
      .waitFor();
    const saved = await api(`/studio/${story.id}`);
    assert.deepEqual(
      saved.story.storyNodes.opening.choices[2].availableWhen,
      mixed,
    );
    assert.deepEqual(
      saved.story.storyNodes.opening.choices[1].outcome,
      opening.choices[1].outcome,
    );
    assert.equal(
      saved.story.storyNodes.opening.choices[1].availableWhen.kind,
      "any",
    );
    await tab.reload();
    await open();
    await tab.getByText("Build option 2 conditions", { exact: true }).click();
    assert.equal(
      await editor
        .getByLabel("Condition 1.1.2 key", { exact: true })
        .inputValue(),
      `story|${story.id}:hero`,
    );
    await tab.getByRole("button", { name: "Preview", exact: true }).click();
    await preview
      .getByRole("heading", { name: "Opening", exact: true })
      .waitFor();
    assert.equal(
      await preview.getByRole("button", { name: /Composite exit/ }).count(),
      0,
    );
    await preview.getByText("Why these options?", { exact: true }).click();
    const checks = preview.getByRole("list", {
      name: "Condition checks for Composite exit",
    });
    assert.match(await checks.innerText(), /Fail 1/);
    assert.match(
      await checks.innerText(),
      /Pass 1.1.3.*agility at least 5. Current agility: 5/,
    );
    assert.match(
      await checks.innerText(),
      /Pass 1.1.4.*quantity exactly 0. Current quantity: 0/,
    );
    for (const theme of ["light", "dark"]) {
      await tab.evaluate((t) => {
        document.documentElement.dataset.theme = t;
      }, theme);
      await checks.scrollIntoViewIfNeeded();
      assert(
        await tab.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await tab.screenshot({
        path:
          "test-results/condition-diagnostics-" + width + "-" + theme + ".png",
        animations: "disabled",
      });
    }
    await preview.getByText("Test key scenarios", { exact: true }).click();
    await preview.getByRole("checkbox", { name: /Hero/ }).check();
    assert.match(await checks.innerText(), /Pass 1:/);
    await preview.getByRole("button", { name: /Composite exit/ }).click();
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
    "PASS: mixed stat/item/key summaries and diagnostics, visual All/Any/Not conditions, explicit apply/reset, persistence, preview routing, unsupported-tree preservation and publication at desktop/mobile.",
  );
} finally {
  await browser.close();
}
