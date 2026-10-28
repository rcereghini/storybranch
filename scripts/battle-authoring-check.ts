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
      const previewItem = `${story.id}:token`;
      story.itemCatalogue = {
        version: 1,
        items: [
          {
            itemId: previewItem,
            name: "Preview token",
            description: "Disposable inventory test",
          },
        ],
      };
      story.storyNodes.ending.inputs = {
        version: 1,
        fields: [
          { name: "rounds", type: "integer", required: false },
          { name: "victory", type: "boolean", required: false },
          { name: "health", type: "integer", required: false },
          { name: "enemy", type: "integer", required: false },
          {
            name: "message",
            type: "string",
            required: false,
            default: "finished",
          },
        ],
      };
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
      // Each outcome carries its own mappings; all scalar/result types are visual.
      for (const outcome of ["win", "loss", "escape"]) {
        await tab
          .getByLabel(`${outcome} rounds source`, { exact: true })
          .selectOption("battle:turns");
        await tab
          .getByLabel(`${outcome} victory source`, { exact: true })
          .selectOption("battle:won");
        await tab
          .getByLabel(`${outcome} health source`, { exact: true })
          .selectOption("battle:playerHealth");
        await tab
          .getByLabel(`${outcome} enemy source`, { exact: true })
          .selectOption("battle:enemyHealth");
        await tab
          .getByLabel(`${outcome} message source`, { exact: true })
          .selectOption("constant:string");
        await tab
          .getByLabel(`${outcome} message value`, { exact: true })
          .fill(`${outcome} message`);
      }
      // Exercise typed constants before returning to authoritative result sources.
      await tab
        .getByLabel("win rounds source", { exact: true })
        .selectOption("constant:integer");
      await tab.getByLabel("win rounds value", { exact: true }).fill("4");
      await tab
        .getByLabel("win victory source", { exact: true })
        .selectOption("constant:boolean");
      await tab
        .getByLabel("win victory value", { exact: true })
        .selectOption("true");
      await tab
        .getByLabel("win rounds source", { exact: true })
        .selectOption("battle:turns");
      await tab
        .getByLabel("win victory source", { exact: true })
        .selectOption("battle:won");
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
      for (const outcome of ["win", "loss", "escape"]) {
        const actual = saved.story.storyNodes[battle.id].outputs[outcome]
          .inputBindings.bindings as { input: string; source: unknown }[];
        assert.deepEqual(
          [...actual].sort((a, b) => a.input.localeCompare(b.input)),
          [
            {
              input: "health",
              source: { kind: "battle", field: "playerHealth" },
            },
            {
              input: "enemy",
              source: { kind: "battle", field: "enemyHealth" },
            },
            {
              input: "message",
              source: { kind: "constant", value: `${outcome} message` },
            },
            { input: "rounds", source: { kind: "battle", field: "turns" } },
            { input: "victory", source: { kind: "battle", field: "won" } },
          ].sort((a, b) => a.input.localeCompare(b.input)),
        );
      }
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
        .getByText("Test stats and inventory", { exact: true })
        .click();
      await preview.getByLabel("Starting strength", { exact: true }).fill("21");
      assert(
        await preview
          .getByRole("button", {
            name: "Apply stats and inventory",
            exact: true,
          })
          .isDisabled(),
      );
      assert(
        await preview
          .getByRole("button", { name: "Replay graph", exact: true })
          .isVisible(),
      );
      await preview.getByLabel("Starting strength", { exact: true }).fill("20");
      await preview
        .getByLabel(`Starting quantity ${previewItem}`, { exact: true })
        .fill("3");
      await preview
        .getByRole("button", { name: "Apply stats and inventory", exact: true })
        .click();
      assert.equal(
        await preview
          .getByLabel("Graph assertions JSON", { exact: true })
          .inputValue(),
        "",
      );
      const setup = JSON.parse(
        await preview
          .getByLabel("Applied graph setup JSON", { exact: true })
          .inputValue(),
      );
      assert.equal(setup.stats.strength, 20);
      assert.equal(setup.items[previewItem], 3);
      await preview
        .getByText("Resolved StoryNode inputs", { exact: true })
        .click();
      await preview
        .getByLabel("Resolved input values")
        .getByText("preemptive: true", { exact: true })
        .waitFor();
      await preview
        .getByRole("button", { name: "Escape", exact: true })
        .click();
      // Terminal action keeps entry inputs; only Continue resolves output bindings.
      await preview
        .getByLabel("Resolved input values")
        .getByText("preemptive: true", { exact: true })
        .waitFor();
      await preview
        .getByRole("button", { name: "Continue", exact: true })
        .click();
      await preview
        .getByLabel("Resolved input values")
        .getByText("victory: false", { exact: true })
        .waitFor();
      await preview
        .getByLabel("Resolved input values")
        .getByText('message: "escape message"', { exact: true })
        .waitFor();
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
        .getByLabel("Resolved input values")
        .scrollIntoViewIfNeeded();
      await tab.screenshot({
        path: `test-results/battle-preview-setup-${width}-${colorScheme}.png`,
      });
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
      // Applied setup survives close/reopen within the editor session.
      await preview
        .getByText("Test stats and inventory", { exact: true })
        .click();
      assert.equal(
        await preview
          .getByLabel("Starting strength", { exact: true })
          .inputValue(),
        "20",
      );
      assert.equal(
        await preview
          .getByLabel(`Starting quantity ${previewItem}`, { exact: true })
          .inputValue(),
        "3",
      );
      await preview.getByText("Test Dice outcomes", { exact: true }).click();
      await preview
        .getByLabel("Preview Dice mode", { exact: true })
        .selectOption("fixed");
      await preview.getByLabel("Preview fixed draw", { exact: true }).fill("0");
      assert(
        await preview
          .getByRole("button", { name: "Apply Dice setup", exact: true })
          .isDisabled(),
      );
      await preview
        .getByLabel("Preview fixed draw", { exact: true })
        .fill("21");
      await preview
        .getByRole("button", { name: "Apply Dice setup", exact: true })
        .click();
      await preview.getByRole("button", { name: /Roll d20/ }).click();
      assert.equal(
        await preview.locator('[data-dice-state="result"]').count(),
        0,
      );
      await preview
        .getByLabel("Preview fixed draw", { exact: true })
        .fill("14");
      await preview
        .getByRole("button", { name: "Apply Dice setup", exact: true })
        .click();
      await preview.getByRole("button", { name: /Roll d20/ }).click();
      await preview.locator('[data-dice-state="result"]').waitFor();
      await preview.getByRole("button", { name: /Next/ }).click();
      await preview
        .getByText("Resolved StoryNode inputs", { exact: true })
        .click();
      await preview
        .getByLabel("Resolved input values")
        .getByText("roll: 14", { exact: true })
        .waitFor();
      await preview
        .getByLabel("Resolved input values")
        .getByText("passed: false", { exact: true })
        .waitFor();
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
      assert.equal(
        await tab.getByLabel("win message value", { exact: true }).inputValue(),
        "win message",
      );
      // Reconnecting preserves stale mappings, with explicit repair and Reset.
      await tab
        .getByLabel("win destination", { exact: true })
        .selectOption("summary");
      await tab
        .getByText(
          "rounds: Unknown destination input — remove or reconnect to repair.",
          { exact: true },
        )
        .waitFor();
      await tab
        .getByRole("button", { name: "Remove win rounds binding", exact: true })
        .click();
      await tab
        .getByLabel("win roll source", { exact: true })
        .selectOption("battle:turns");
      await tab
        .getByLabel("win passed source", { exact: true })
        .selectOption("battle:won");
      assert(
        await tab
          .getByRole("button", { name: "Save battle draft" })
          .isDisabled(),
      );
      await tab
        .getByRole("button", { name: "Reset node changes", exact: true })
        .click();
      assert.equal(
        await tab.getByLabel("win destination", { exact: true }).inputValue(),
        "ending",
      );
      assert.equal(
        await tab.getByLabel("win rounds source", { exact: true }).inputValue(),
        "battle:turns",
      );
      // Removing an optional binding restores the destination default only on Apply.
      await tab
        .getByRole("button", {
          name: "Remove win message binding",
          exact: true,
        })
        .click();
      assert.equal(
        await tab
          .getByLabel("win message source", { exact: true })
          .inputValue(),
        "",
      );
      await tab
        .getByRole("button", { name: "Reset node changes", exact: true })
        .click();
      // Required inputs and stale names are diagnosed before committing node edits.
      await tab
        .getByLabel("win destination", { exact: true })
        .selectOption("summary");
      for (const name of ["rounds", "victory", "health", "enemy", "message"])
        await tab
          .getByRole("button", {
            name: `Remove win ${name} binding`,
            exact: true,
          })
          .click();
      await tab
        .getByLabel("Pending battle diagnostics")
        .getByText(/Required input has no source: roll/)
        .waitFor();
      await tab
        .getByRole("button", { name: "Reset node changes", exact: true })
        .click();
      await tab
        .getByRole("group", { name: "win input bindings", exact: true })
        .scrollIntoViewIfNeeded();
      await tab.screenshot({
        path: `test-results/battle-bindings-${width}-${colorScheme}.png`,
      });
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
