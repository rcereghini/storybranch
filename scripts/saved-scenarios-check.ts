import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { starterStory } from "../apps/web/src/studio-model";
import { launchBrowser } from "./browser";

const auth = await fetch(
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
assert(auth.ok);
const { idToken } = await auth.json();
async function api(path: string, body?: unknown) {
  const result = await fetch(`http://127.0.0.1:5173/api${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      authorization: `Bearer ${idToken}`,
      "content-type": "application/json",
      "X-Story-Contract": "story-nodes-v1",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await result.json();
  assert.equal(result.status, 200, JSON.stringify(data));
  return data;
}
const browser = await launchBrowser();
try {
  for (const width of [1440, 390]) {
    const story = starterStory(`scenarios-${randomUUID()}`);
    story.title = `Saved setups ${width}`;
    const itemId = `${story.id}:coin`;
    story.itemCatalogue = {
      version: 1,
      items: [{ itemId, name: "Coin", description: "Test coin" }],
    };
    await api(`/studio/${story.id}`, {
      idempotencyKey: randomUUID(),
      expectedRevision: 0,
      draft: {
        story,
        description: "Browser check",
        playtestScenarios: [
          {
            id: "stale",
            name: "Outdated setup",
            scenario: {
              version: 1,
              storyKeys: [],
              importedKeys: [],
              accountKeys: [],
              items: { [`${story.id}:removed`]: 1 },
            },
          },
        ],
      },
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
      await tab.getByRole("button", { name: "Preview", exact: true }).click();
    };
    await open();
    const preview = tab.getByRole("dialog", { name: "Private preview" });
    const setups = preview
      .locator("details")
      .filter({
        has: tab.locator("summary", { hasText: "Saved playtest setups" }),
      });
    await setups.locator("summary").click();
    await setups
      .getByLabel("Saved playtest setup", { exact: true })
      .selectOption("stale");
    await setups
      .getByRole("list", { name: "Unavailable setup references" })
      .waitFor();
    assert(
      await setups
        .getByRole("button", { name: "Load setup", exact: true })
        .isDisabled(),
    );
    await preview
      .getByText("Test stats and inventory", { exact: true })
      .click();
    await preview.getByLabel("Starting agility", { exact: true }).fill("8");
    await preview
      .getByLabel(`Starting quantity ${itemId}`, { exact: true })
      .fill("5");
    await preview
      .getByRole("button", { name: "Apply stats and inventory", exact: true })
      .click();
    await setups
      .getByLabel("Playtest setup name", { exact: true })
      .fill("Enough coins");
    await setups
      .getByRole("button", { name: "Save current setup as new", exact: true })
      .click();
    await setups
      .getByRole("button", { name: "Duplicate setup", exact: true })
      .click();
    await setups
      .getByLabel("Playtest setup name", { exact: true })
      .fill("Spare setup");
    await setups
      .getByRole("button", { name: "Rename setup", exact: true })
      .click();
    await setups
      .getByRole("button", { name: "Delete setup", exact: true })
      .click();
    await preview.getByRole("button", { name: "Close preview" }).click();
    await tab.getByRole("button", { name: "Save draft", exact: true }).click();
    await tab
      .locator(".studio-status")
      .getByText("All changes saved", { exact: true })
      .waitFor();
    const saved = await api(`/studio/${story.id}`);
    assert.equal(saved.playtestScenarios.length, 2);
    const enough = saved.playtestScenarios.find(
      (e: { name: string }) => e.name === "Enough coins",
    );
    assert.equal(enough.scenario.stats.agility, 8);
    assert.equal(enough.scenario.items[itemId], 5);
    await tab.reload();
    await open();
    await setups.locator("summary").click();
    await setups
      .getByLabel("Saved playtest setup", { exact: true })
      .selectOption(enough.id);
    await setups
      .getByRole("button", { name: "Load setup", exact: true })
      .click();
    await preview
      .getByText("Test stats and inventory", { exact: true })
      .click();
    assert.equal(
      await preview
        .getByLabel("Starting agility", { exact: true })
        .inputValue(),
      "8",
    );
    assert.equal(
      await preview
        .getByLabel(`Starting quantity ${itemId}`, { exact: true })
        .inputValue(),
      "5",
    );
    await setups
      .getByLabel("Saved playtest setup", { exact: true })
      .selectOption("stale");
    for (const theme of ["light", "dark"]) {
      await tab.evaluate((t) => {
        document.documentElement.dataset.theme = t;
      }, theme);
      await setups.scrollIntoViewIfNeeded();
      assert(await preview.evaluate((el) => el.scrollWidth <= el.clientWidth));
      await tab.screenshot({
        path: `test-results/saved-scenarios-${width}-${theme}.png`,
        animations: "disabled",
      });
    }
    await setups
      .getByRole("button", { name: "Replace with current setup", exact: true })
      .click();
    assert(
      await setups
        .getByRole("button", { name: "Load setup", exact: true })
        .isEnabled(),
    );
    await setups
      .getByRole("button", { name: "Load setup", exact: true })
      .click();
    await preview.getByRole("button", { name: "Close preview" }).click();
    await tab.getByRole("button", { name: "Save draft", exact: true }).click();
    await tab
      .locator(".studio-status")
      .getByText("All changes saved", { exact: true })
      .waitFor();
    assert.equal(
      (await api(`/studio/${story.id}`)).playtestScenarios[0].scenario.items[
        itemId
      ],
      5,
    );
    assert.deepEqual(errors, []);
    await tab.close();
  }
  console.log(
    "PASS: saved playtest setup creation, duplicate/rename/delete, persistence, load, stale diagnostics and replacement at desktop/mobile.",
  );
} finally {
  await browser.close();
}
