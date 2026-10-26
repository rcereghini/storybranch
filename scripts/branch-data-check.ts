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
  const response = await fetch(`http://127.0.0.1:5173/api${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      authorization: `Bearer ${idToken}`,
      "content-type": "application/json",
      "X-Story-Contract": "story-nodes-v1",
      "X-Story-Player": "player-view-v1",
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
    const story = branchDataStory(`bindings-${randomUUID()}`);
    story.title = `Input bindings ${width}`;
    await api(`/studio/${story.id}`, {
      idempotencyKey: randomUUID(),
      expectedRevision: 0,
      draft: { story, description: "Browser test" },
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
        .selectOption("dice");
      await tab
        .getByText("Advanced conditions and effects (JSON)", { exact: true })
        .click();
    };
    await open();
    const inputs = {
      version: 1,
      fields: [
        { name: "attempt", type: "integer", required: true, default: 2 },
      ],
    };
    await tab
      .getByLabel("Inputs JSON", { exact: true })
      .fill(JSON.stringify(inputs));
    await tab.getByLabel("Outputs JSON", { exact: true }).focus();
    await tab.getByRole("button", { name: "Save draft", exact: true }).click();
    await tab
      .locator(".studio-status")
      .getByText("All changes saved", { exact: true })
      .waitFor();
    assert.deepEqual(
      (await api(`/studio/${story.id}`)).story.storyNodes.dice.inputs,
      inputs,
    );
    for (const theme of ["light", "dark"]) {
      await tab.evaluate((t) => {
        document.documentElement.dataset.theme = t;
      }, theme);
      await tab
        .getByLabel("Inputs JSON", { exact: true })
        .scrollIntoViewIfNeeded();
      assert(
        await tab.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await tab.screenshot({
        path: `test-results/branch-data-${width}-${theme}.png`,
        animations: "disabled",
      });
    }
    await tab.reload();
    await open();
    assert.deepEqual(
      JSON.parse(
        await tab.getByLabel("Inputs JSON", { exact: true }).inputValue(),
      ),
      inputs,
    );
    await tab.getByRole("button", { name: "Preview", exact: true }).click();
    const preview = tab.getByRole("dialog", { name: "Private preview" });
    await preview.getByRole("button", { name: /Roll d20/ }).click();
    await preview.locator('[data-dice-state="result"]').waitFor();
    await preview.getByRole("button", { name: /Next/ }).click();
    await preview
      .getByRole("heading", { name: "Scouting complete", exact: true })
      .waitFor();
    assert.equal(
      await preview.getByText("private-input-marker", { exact: true }).count(),
      0,
    );
    await preview.getByRole("button", { name: /Finish/ }).click();
    await preview
      .getByRole("heading", { name: "Finished", exact: true })
      .waitFor();
    await preview.getByRole("button", { name: "Close preview" }).click();
    const draft = await api(`/studio/${story.id}`);
    await api(`/studio/${story.id}/publish`, {
      idempotencyKey: randomUUID(),
      expectedRevision: draft.revision,
      policyVersion: "creator-alpha-1",
    });
    const begun = await api("/playthroughs", {
      idempotencyKey: randomUUID(),
      payload: { storyId: story.id },
    });
    await tab.goto(`http://127.0.0.1:5173/play/${begun.player.save.id}`);
    await tab.getByRole("button", { name: /Roll d20/ }).click();
    await tab.locator('[data-dice-state="result"]').waitFor();
    await tab.reload();
    await tab.locator('[data-dice-state="result"]').waitFor();
    await tab.getByRole("button", { name: /Next/ }).click();
    await tab
      .getByRole("heading", { name: "Scouting complete", exact: true })
      .waitFor();
    await tab.getByRole("button", { name: /Finish/ }).click();
    await tab.getByRole("heading", { name: "Finished", exact: true }).waitFor();
    assert.deepEqual(errors, []);
    await tab.close();
    console.log(`StoryBranch inputs verified at ${width}`);
  }
} finally {
  await browser.close();
}
