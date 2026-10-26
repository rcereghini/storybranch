import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { branchDataStory } from "../fixtures/branch-data";
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
    const story = branchDataStory(`replay-${randomUUID()}`);
    story.title = `Repeatable playtest ${width}`;
    await api(`/studio/${story.id}`, {
      idempotencyKey: randomUUID(),
      expectedRevision: 0,
      draft: { story, description: "Replay check" },
    });
    const tab = await browser.newPage({ viewport: { width, height: 950 } });
    tab.setDefaultTimeout(15000);
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
    const recording = preview
      .locator("details")
      .filter({
        has: tab.locator("summary", {
          hasText: "Recorded playtest and assertions",
        }),
      });
    const setups = preview
      .locator("details")
      .filter({
        has: tab.locator("summary", { hasText: "Saved playtest setups" }),
      });
    await preview
      .getByLabel("Preview dice result", { exact: true })
      .selectOption("fixed");
    await preview.getByLabel("Exact preview roll", { exact: true }).fill("14");
    await preview.getByRole("button", { name: /Roll d20/ }).click();
    await preview.locator('[data-dice-state="result"]').waitFor();
    await preview.getByRole("button", { name: /Next/ }).click();
    await preview.getByRole("button", { name: /Finish/ }).click();
    await recording.locator("summary").click();
    assert.equal(
      await recording
        .getByRole("list", { name: "Preview route history" })
        .locator("li")
        .count(),
      3,
    );
    await recording
      .getByRole("button", { name: "Capture path as assertions", exact: true })
      .click();
    await recording
      .getByRole("button", { name: "Run applied assertions", exact: true })
      .click();
    await recording
      .getByRole("status")
      .filter({ hasText: "PASS: 3 assertions passed. Story completed." })
      .waitFor();
    await setups.locator("summary").click();
    await setups
      .getByLabel("Playtest setup name", { exact: true })
      .fill("Fixed fourteen");
    await setups
      .getByRole("button", { name: "Save current setup as new", exact: true })
      .click();
    await setups
      .getByRole("button", { name: "Run saved assertions", exact: true })
      .click();
    await setups.getByRole("status").filter({ hasText: "PASS" }).waitFor();
    await preview.getByRole("button", { name: "Close preview" }).click();
    await tab.getByRole("button", { name: "Save draft", exact: true }).click();
    await tab
      .locator(".studio-status")
      .getByText("All changes saved", { exact: true })
      .waitFor();
    const saved = await api(`/studio/${story.id}`);
    const setup = saved.playtestScenarios[0];
    assert.deepEqual(setup.scenario.dice, { mode: "fixed", value: 14 });
    assert.equal(setup.scenario.replay.steps.length, 3);
    assert.equal(setup.scenario.replay.steps[0].roll, 14);
    await tab.reload();
    await open();
    await setups.locator("summary").click();
    await setups
      .getByLabel("Saved playtest setup", { exact: true })
      .selectOption(setup.id);
    await setups
      .getByRole("button", { name: "Load setup", exact: true })
      .click();
    assert.equal(
      await preview
        .getByLabel("Exact preview roll", { exact: true })
        .inputValue(),
      "14",
    );
    await recording.locator("summary").click();
    assert.equal(
      await recording
        .getByRole("list", { name: "Preview route history" })
        .locator("li")
        .count(),
      0,
    );
    await recording
      .getByRole("button", { name: "Run applied assertions", exact: true })
      .click();
    await recording.getByRole("status").filter({ hasText: "PASS" }).waitFor();
    assert(await preview.getByRole("button", { name: /Roll d20/ }).isEnabled());
    await recording
      .getByLabel("Expected destination 2", { exact: true })
      .selectOption("dice");
    await recording
      .getByRole("button", { name: "Apply assertions", exact: true })
      .click();
    await recording
      .getByRole("button", { name: "Run applied assertions", exact: true })
      .click();
    await recording
      .getByRole("status")
      .filter({ hasText: "FAIL: Step 2" })
      .waitFor();
    for (const theme of ["light", "dark"]) {
      await tab.evaluate(
        (t) => (document.documentElement.dataset.theme = t),
        theme,
      );
      await recording.scrollIntoViewIfNeeded();
      assert(await preview.evaluate((el) => el.scrollWidth <= el.clientWidth));
      await tab.screenshot({
        path: `test-results/repeatable-playtests-${width}-${theme}.png`,
        animations: "disabled",
      });
    }
    await recording
      .getByRole("button", { name: "Restart preview recording", exact: true })
      .click();
    assert.equal(
      await recording
        .getByRole("list", { name: "Preview route history" })
        .locator("li")
        .count(),
      0,
    );
    assert(
      await recording
        .getByRole("button", { name: "Run applied assertions", exact: true })
        .isEnabled(),
    );
    assert.deepEqual(errors, []);
    await tab.close();
  }
  console.log(
    "PASS: exact Dice recording, capture/edit/run assertions, private persistence and reload, isolated replay, desktop/mobile themes.",
  );
} finally {
  await browser.close();
}
