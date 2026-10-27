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
  for (const width of [1440, 390])
    for (const colorScheme of ["light", "dark"] as const) {
      const story = branchDataStory(`battle-author-${randomUUID()}`);
      story.title = `Battle draft ${width} ${colorScheme}`;
      await api(`/studio/${story.id}`, {
        idempotencyKey: randomUUID(),
        expectedRevision: 0,
        draft: { story, description: "Battle authoring check" },
      });
      const tab = await browser.newPage({
        viewport: { width, height: 950 },
        colorScheme,
        reducedMotion: "reduce",
      });
      tab.setDefaultTimeout(15000);
      const errors: string[] = [],
        playerWrites: string[] = [];
      tab.on("pageerror", (e) => errors.push(e.message));
      tab.on("request", (request) => {
        if (
          request.method() === "POST" &&
          request.url().includes("/api/playthroughs")
        )
          playerWrites.push(request.url());
      });
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
      await tab.getByRole("button", { name: new RegExp(story.title) }).click();
      await tab
        .getByRole("button", { name: "Battle authoring", exact: true })
        .click();
      await tab
        .getByRole("button", { name: "+ Add Battle", exact: true })
        .click();
      await tab.getByLabel("Enemy health", { exact: true }).fill("1");
      assert(
        await tab
          .getByRole("button", { name: "Save battle draft" })
          .isDisabled(),
      );
      await tab
        .getByRole("button", { name: "Apply node changes", exact: true })
        .click();
      await tab.getByText("Advanced node JSON", { exact: true }).click();
      const input = tab.getByLabel("Node JSON", { exact: true });
      const battle = JSON.parse(await input.inputValue());
      battle.inputs = {
        version: 1,
        fields: [
          {
            name: "preemptive",
            type: "boolean",
            required: true,
            default: true,
          },
          { name: "bonus", type: "integer", required: true, default: 2 },
          { name: "roll", type: "integer", required: false },
          { name: "passed", type: "boolean", required: false },
        ],
      };
      await input.fill(JSON.stringify(battle));
      await tab
        .getByRole("button", { name: "Apply node JSON", exact: true })
        .click();
      await tab
        .getByLabel("preemptive input", { exact: true })
        .selectOption("preemptive");
      await tab
        .getByLabel("attackBonus input", { exact: true })
        .selectOption("bonus");
      await tab
        .getByRole("button", { name: "Apply node changes", exact: true })
        .click();
      await tab
        .getByLabel("First StoryNode", { exact: true })
        .selectOption(battle.id);
      // A committed request with a lost response must reuse the same command.
      const path = `**/api/studio/${story.id}`;
      let dropped = false;
      await tab.route(path, async (route) => {
        if (route.request().method() === "POST" && !dropped) {
          dropped = true;
          await route.fetch();
          await route.abort("failed");
        } else await route.continue();
      });
      await tab
        .getByRole("button", { name: "Save battle draft", exact: true })
        .click();
      await tab
        .getByRole("button", { name: "Retry save", exact: true })
        .waitFor();
      await tab
        .getByRole("button", { name: "Retry save", exact: true })
        .click();
      await tab
        .locator(".battle-authoring-status")
        .first()
        .filter({ hasText: "Draft saved" })
        .waitFor();
      await tab.unroute(path);
      const saved = await api(`/studio/${story.id}`);
      assert.equal(saved.revision, 2);
      assert.equal(saved.story.storyNodes[battle.id].storyNodeType, "battle");
      assert.equal(
        saved.story.storyNodes[battle.id].battle.inputs.attackBonus,
        "bonus",
      );
      assert.deepEqual(saved.story.storyNodes.dice, story.storyNodes.dice);
      await tab.reload();
      await tab.getByRole("button", { name: new RegExp(story.title) }).click();
      await tab
        .getByRole("heading", { name: "Battle authoring", exact: true })
        .waitFor();
      await tab
        .getByRole("button", { name: "Preview graph", exact: true })
        .click();
      const preview = tab.getByRole("dialog", {
        name: "Battle graph preview",
        exact: true,
      });
      await preview
        .getByRole("button", { name: "Attack", exact: true })
        .click();
      await preview
        .getByText("Victory. Your result is saved.", { exact: true })
        .waitFor();
      assert.equal(
        await preview.getByRole("button", { name: "Replay graph" }).count(),
        0,
      );
      await preview
        .getByRole("button", { name: "Continue", exact: true })
        .click();
      await preview.getByRole("button", { name: "Replay graph" }).waitFor();
      await preview.getByText("Graph assertions", { exact: true }).click();
      await preview
        .getByRole("button", { name: "Capture graph assertions" })
        .click();
      await preview
        .getByRole("button", { name: "Run graph assertions" })
        .click();
      await preview
        .getByRole("status")
        .filter({ hasText: "PASS: 2 assertions passed. Story completed." })
        .waitFor();
      await preview
        .getByRole("button", { name: "Close graph preview" })
        .click();
      // All three battle edges are exposed on the shared canvas.
      await tab.getByRole("button", { name: "Fit", exact: true }).click();
      for (const outcome of ["Win", "Loss", "Escape"]) {
        await tab
          .getByRole("button", {
            name: `Connect ${outcome} from New battle`,
            exact: true,
          })
          .click();
        await tab
          .getByRole("button", { name: "Connect to Finished", exact: true })
          .click();
      }
      // Ordinary Dice routes feed the real battle placement, keeping bindings.
      for (const outcome of ["Pass", "Fail"]) {
        await tab
          .getByRole("button", {
            name: `Connect Roll d20 · ${outcome} from Roll`,
            exact: true,
          })
          .click();
        await tab
          .getByRole("button", { name: "Connect to New battle", exact: true })
          .click();
      }
      await tab
        .getByLabel("First StoryNode", { exact: true })
        .selectOption("dice");
      await tab
        .getByRole("button", { name: "Save battle draft", exact: true })
        .click();
      await tab
        .locator(".battle-authoring-status")
        .first()
        .filter({ hasText: "Draft saved" })
        .waitFor();
      await tab
        .getByRole("button", { name: "Preview graph", exact: true })
        .click();
      await preview.getByRole("button", { name: /Roll d20/ }).click();
      await preview.locator('[data-dice-state="result"]').waitFor();
      await preview.getByRole("button", { name: /Next/ }).click();
      await preview
        .getByRole("button", { name: "Attack", exact: true })
        .click();
      await preview
        .getByRole("button", { name: "Continue", exact: true })
        .click();
      await preview.getByRole("button", { name: "Replay graph" }).waitFor();
      await preview.getByText("Graph assertions", { exact: true }).click();
      await preview
        .getByRole("button", { name: "Capture graph assertions" })
        .click();
      await preview
        .getByRole("button", { name: "Run graph assertions" })
        .click();
      await preview
        .getByRole("status")
        .filter({ hasText: "PASS: 4 assertions passed. Story completed." })
        .waitFor();
      await preview
        .getByRole("button", { name: "Close graph preview" })
        .click();
      await tab
        .getByRole("button", { name: "Edit New battle", exact: true })
        .click();
      await tab
        .getByLabel("loss destination", { exact: true })
        .selectOption("unfinished");
      await tab
        .getByRole("button", { name: "Apply node changes", exact: true })
        .click();
      assert(
        await tab
          .getByRole("button", { name: "Preview graph", exact: true })
          .isDisabled(),
      );
      await tab
        .getByRole("button", { name: "Undo graph edit", exact: true })
        .click();
      assert(
        await tab
          .getByRole("button", { name: "Preview graph", exact: true })
          .isEnabled(),
      );
      assert(
        await tab.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      await tab
        .getByRole("heading", { name: "Battle authoring", exact: true })
        .scrollIntoViewIfNeeded();
      await tab.screenshot({
        path: `test-results/battle-authoring-${width}-${colorScheme}.png`,
      });
      assert.deepEqual(playerWrites, []);
      assert.deepEqual(errors, []);
      await tab.close();
      console.log(`Battle authoring passed ${width}px ${colorScheme}`);
    }
} finally {
  await browser.close();
}
