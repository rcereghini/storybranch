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
      const story = branchDataStory(`workshop-${randomUUID()}`);
      story.title = `Battle workshop ${width} ${colorScheme}`;
      const saved = await api(`/studio/${story.id}`, {
        idempotencyKey: randomUUID(),
        expectedRevision: 0,
        draft: { story, description: "Disposable workshop check" },
      });
      const tab = await browser.newPage({
        viewport: { width, height: 950 },
        colorScheme,
        reducedMotion: "reduce",
      });
      tab.setDefaultTimeout(15000);
      const errors: string[] = [],
        mutations: string[] = [];
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
      await tab.getByRole("button", { name: new RegExp(story.title) }).click();
      const launcher = tab.getByRole("button", {
        name: "Battle workshop",
        exact: true,
      });
      await launcher.click();
      tab.on("request", (request) => {
        if (request.method() === "POST" && request.url().includes("/api/"))
          mutations.push(request.url());
      });
      const workshop = tab.getByRole("dialog", {
        name: "Battle workshop",
        exact: true,
      });
      const notice = workshop.locator(".battle-workshop-status");
      await workshop.getByLabel("Enemy health", { exact: true }).fill("1");
      await workshop.getByRole("button", { name: "Apply and restart" }).click();
      await workshop
        .getByRole("button", { name: "Attack", exact: true })
        .click();
      await workshop
        .getByText("Victory. Your result is saved.", { exact: true })
        .waitFor();
      assert.equal(
        await workshop
          .getByRole("button", { name: "Play rehearsal again" })
          .count(),
        0,
      );
      // A rejected setup must preserve the pending result and original route.
      await workshop.getByLabel("Win destination").selectOption("summary");
      await workshop.getByRole("button", { name: "Apply and restart" }).click();
      await notice.filter({ hasText: /safe|input|start/i }).waitFor();
      await workshop
        .getByText("Victory. Your result is saved.", { exact: true })
        .waitFor();
      await workshop
        .getByRole("button", { name: "Reset configuration" })
        .click();
      assert.equal(
        await workshop.getByLabel("Win destination").inputValue(),
        "ending",
      );
      await workshop
        .getByRole("button", { name: "Continue", exact: true })
        .click();
      await workshop
        .getByRole("button", { name: "Play rehearsal again" })
        .waitFor();
      await workshop
        .getByText("Recorded battle playtest", { exact: true })
        .click();
      assert.equal(
        await workshop
          .getByRole("list", { name: "Battle preview history" })
          .locator("li")
          .count(),
        2,
      );
      await workshop
        .getByRole("button", { name: "Capture battle assertions" })
        .click();
      await workshop
        .getByRole("button", { name: "Run battle assertions" })
        .click();
      await notice
        .filter({ hasText: "PASS: 2 assertions passed. Story completed." })
        .waitFor();
      const replay = workshop.getByLabel("Battle assertions JSON");
      const captured = await replay.inputValue();
      const changed = JSON.parse(captured);
      changed.steps[0].expected.health = 0;
      await replay.fill(JSON.stringify(changed));
      await workshop
        .getByRole("button", { name: "Run battle assertions" })
        .click();
      await notice.filter({ hasText: "FAIL: Step 1" }).waitFor();
      await workshop
        .getByRole("button", { name: "Play rehearsal again" })
        .waitFor();
      await replay.fill(captured);
      await workshop.getByRole("button", { name: "Restart recording" }).click();
      await workshop
        .getByRole("button", { name: "Escape", exact: true })
        .click();
      await workshop
        .getByText("You escaped. Your result is saved.", { exact: true })
        .waitFor();
      await workshop
        .getByRole("button", { name: "Continue", exact: true })
        .click();
      await workshop
        .getByRole("button", { name: "Play rehearsal again" })
        .waitFor();
      // A deterministic turn-limit loss follows a separate Continue as well.
      await workshop.getByLabel("Enemy health", { exact: true }).fill("100");
      await workshop.getByLabel("Turn limit").fill("1");
      await workshop.getByRole("button", { name: "Apply and restart" }).click();
      await workshop
        .getByRole("button", { name: "Guard", exact: true })
        .click();
      await workshop
        .getByText("Time ran out. Your result is saved.", { exact: true })
        .waitFor();
      await workshop
        .getByRole("button", { name: "Continue", exact: true })
        .click();
      await workshop
        .getByRole("button", { name: "Play rehearsal again" })
        .waitFor();
      // Hide controls to inspect shared player layout, then verify modal geometry.
      await workshop
        .getByText("Encounter configuration", { exact: true })
        .click();
      await workshop
        .getByText("Recorded battle playtest", { exact: true })
        .click();
      assert(
        await workshop.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
      );
      assert(
        await tab.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      await workshop
        .getByRole("button", { name: "Play rehearsal again" })
        .click();
      await workshop
        .getByRole("button", { name: "Guard", exact: true })
        .click();
      await tab.screenshot({
        path: `test-results/battle-workshop-${width}-${colorScheme}.png`,
      });
      // Rehearse a downstream encounter: retain Dice input bindings and separate Roll/Next.
      await workshop
        .getByText("Encounter configuration", { exact: true })
        .click();
      await workshop.getByLabel("Scene to rehearse").selectOption("summary");
      await workshop.getByLabel("Enemy health", { exact: true }).fill("1");
      await workshop.getByRole("button", { name: "Apply and restart" }).click();
      await workshop.getByRole("button", { name: /Roll d20/ }).click();
      await workshop.locator('[data-dice-state="result"]').waitFor();
      assert.equal(
        await workshop
          .getByRole("button", { name: "Attack", exact: true })
          .count(),
        0,
      );
      await workshop.getByRole("button", { name: /Next/ }).click();
      await workshop
        .getByRole("button", { name: "Attack", exact: true })
        .click();
      await workshop
        .getByRole("button", { name: "Continue", exact: true })
        .click();
      await workshop
        .getByRole("button", { name: "Play rehearsal again" })
        .waitFor();
      await workshop
        .getByText("Recorded battle playtest", { exact: true })
        .click();
      await workshop
        .getByRole("button", { name: "Capture battle assertions" })
        .click();
      await workshop
        .getByRole("button", { name: "Run battle assertions" })
        .click();
      await notice
        .filter({ hasText: "PASS: 4 assertions passed. Story completed." })
        .waitFor();
      await workshop.getByRole("button", { name: "Close workshop" }).focus();
      await tab.keyboard.press("Shift+Tab");
      assert(
        await workshop.evaluate((el) => el.contains(document.activeElement)),
      );
      await tab.keyboard.press("Escape");
      await workshop.waitFor({ state: "hidden" });
      assert(await launcher.evaluate((el) => el === document.activeElement));
      await launcher.click();
      assert.equal(
        await workshop
          .getByRole("button", { name: "Attack", exact: true })
          .count(),
        0,
      );
      await workshop.getByRole("button", { name: "Close workshop" }).click();
      assert.deepEqual(
        mutations,
        [],
        "Workshop must not persist drafts or player commands",
      );
      assert.deepEqual(
        await api(`/studio/${story.id}`),
        saved,
        "Draft must remain unchanged",
      );
      assert.deepEqual(errors, []);
      // Explicit saves persist rehearsal metadata only, through Studio autosave/undo.
      const savedWrite = () =>
        tab.waitForResponse(
          (response) =>
            response.url().endsWith(`/api/studio/${story.id}`) &&
            response.request().method() === "POST" &&
            response.status() === 200,
        );
      await launcher.click();
      await workshop.getByRole("button", { name: "Apply and restart" }).click();
      await workshop
        .getByRole("button", { name: "Escape", exact: true })
        .click();
      await workshop
        .getByRole("button", { name: "Continue", exact: true })
        .click();
      await workshop
        .getByText("Recorded battle playtest", { exact: true })
        .click();
      await workshop
        .getByRole("button", { name: "Capture battle assertions" })
        .click();
      await workshop
        .getByText("Saved battle rehearsals (0/10)", { exact: true })
        .click();
      await workshop
        .getByLabel("Rehearsal name", { exact: true })
        .fill("Escape test");
      let write = savedWrite();
      await workshop
        .getByRole("button", { name: "Save rehearsal as new" })
        .click();
      await write;
      const persisted = await api(`/studio/${story.id}`);
      assert.equal(persisted.battlePlaytests[0].name, "Escape test");
      assert.equal(persisted.battlePlaytests[0].replay.steps.length, 2);
      assert.deepEqual(persisted.story, saved.story);
      await workshop.getByRole("button", { name: "Close workshop" }).click();
      write = savedWrite();
      if (width < 1240) await tab.keyboard.press("Control+z");
      else await tab.getByRole("button", { name: "Undo", exact: true }).click();
      await write;
      assert.equal(
        (await api(`/studio/${story.id}`)).battlePlaytests?.length ?? 0,
        0,
      );
      write = savedWrite();
      if (width < 1240) await tab.keyboard.press("Control+Shift+z");
      else await tab.getByRole("button", { name: "Redo", exact: true }).click();
      await write;
      await tab.reload();
      await tab.getByRole("button", { name: new RegExp(story.title) }).click();
      await launcher.click();
      await workshop
        .getByText("Saved battle rehearsals (1/10)", { exact: true })
        .click();
      await workshop
        .getByLabel("Saved battle rehearsal", { exact: true })
        .selectOption(persisted.battlePlaytests[0].id);
      await workshop
        .getByRole("button", { name: "Load rehearsal", exact: true })
        .click();
      await workshop
        .getByRole("button", { name: "Attack", exact: true })
        .waitFor();
      await workshop
        .getByText("Recorded battle playtest", { exact: true })
        .click();
      await workshop
        .getByRole("button", { name: "Run battle assertions" })
        .click();
      await notice
        .filter({ hasText: "PASS: 2 assertions passed. Story completed." })
        .waitFor();
      await workshop.getByLabel("Battle assertions JSON").fill("{}");
      await workshop
        .getByRole("button", { name: "Update saved rehearsal" })
        .click();
      await notice.filter({ hasText: "valid assertions" }).waitFor();
      assert.deepEqual(
        (await api(`/studio/${story.id}`)).battlePlaytests,
        persisted.battlePlaytests,
      );
      await workshop
        .getByRole("button", { name: "Load rehearsal", exact: true })
        .click();
      await workshop
        .getByLabel("Rehearsal name", { exact: true })
        .fill("Escape renamed");
      write = savedWrite();
      await workshop
        .getByRole("button", { name: "Update saved rehearsal" })
        .click();
      await write;
      assert.equal(
        (await api(`/studio/${story.id}`)).battlePlaytests[0].name,
        "Escape renamed",
      );
      await tab.screenshot({
        path: `test-results/saved-battle-${width}-${colorScheme}.png`,
      });
      assert(
        await workshop.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
      );
      // Simulate a saved rehearsal whose source was removed by later Story editing.
      await workshop.getByRole("button", { name: "Close workshop" }).click();
      const latest = await api(`/studio/${story.id}`);
      await api(`/studio/${story.id}`, {
        idempotencyKey: randomUUID(),
        expectedRevision: latest.revision,
        draft: {
          story: latest.story,
          description: latest.description,
          battlePlaytests: latest.battlePlaytests.map(
            (item: { setup: object }) => ({
              ...item,
              setup: { ...item.setup, storyNodeId: "removed-source" },
            }),
          ),
        },
      });
      await tab.reload();
      await tab.getByRole("button", { name: new RegExp(story.title) }).click();
      await launcher.click();
      await workshop.getByRole("button", { name: "Apply and restart" }).click();
      await workshop
        .getByText("Saved battle rehearsals (1/10)", { exact: true })
        .click();
      await workshop
        .getByLabel("Saved battle rehearsal", { exact: true })
        .selectOption(persisted.battlePlaytests[0].id);
      await workshop
        .getByRole("button", { name: "Load rehearsal", exact: true })
        .click();
      await notice.filter({ hasText: "Select a scene" }).waitFor();
      await workshop
        .getByRole("button", { name: "Attack", exact: true })
        .waitFor();
      assert.equal(
        await workshop.getByLabel("Scene to rehearse").inputValue(),
        "dice",
      );
      write = savedWrite();
      await workshop.getByRole("button", { name: "Remove rehearsal" }).click();
      await write;
      assert.deepEqual((await api(`/studio/${story.id}`)).battlePlaytests, []);
      assert(
        mutations.every((url: string) =>
          url.endsWith(`/api/studio/${story.id}`),
        ),
        "Only draft metadata may be written",
      );
      assert.deepEqual(errors, []);
      await tab.close();
      console.log(`Battle workshop passed: ${width}px ${colorScheme}`);
    }
} finally {
  await browser.close();
}
