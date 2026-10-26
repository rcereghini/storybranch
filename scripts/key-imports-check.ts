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
    const source = starterStory(`prequel-${randomUUID()}`);
    const target = starterStory(`sequel-${randomUUID()}`);
    source.title = `Prequel ${width}`;
    target.title = `Sequel ${width} ${Date.now()}`;
    const save = (story: typeof source, expectedRevision: number) =>
      api(`/studio/${story.id}`, {
        idempotencyKey: randomUUID(),
        expectedRevision,
        draft: { story, description: "Emulator import verification" },
      });
    const publish = (story: typeof source, expectedRevision: number) =>
      api(`/studio/${story.id}/publish`, {
        idempotencyKey: randomUUID(),
        expectedRevision,
        policyVersion: "creator-alpha-1",
      });
    await save(target, 0);
    source.progression = {
      version: 1,
      keys: [
        {
          keyId: `${source.id}:hero`,
          label: "Hero",
          afterCompletions: 1,
          exportToStoryIds: [target.id],
        },
      ],
    };
    source.runKeyExports = {
      version: 1,
      keys: [
        {
          keyId: `${source.id}:rescued`,
          label: "Rescued the captain",
          exportToStoryIds: [target.id],
        },
      ],
    };
    source.storyNodes.opening.storyNodeType = "text-options";
    source.storyNodes.rescued = {
      ...structuredClone(source.storyNodes.ending),
      id: "rescued",
      title: "Captain rescued",
      leaf: {
        version: 1,
        summary: "A friend survives.",
        rewards: [{ keyId: `${source.id}:rescued`, label: "Captain rescued" }],
      },
    };
    source.storyNodes.opening.choices.push({
      ...structuredClone(source.storyNodes.opening.choices[0]),
      id: "rescue",
      label: "Rescue the captain",
      outcome: {
        kind: "direct",
        route: { targetStoryNodeId: "rescued", effects: [] },
      },
    });
    await save(source, 0);
    await publish(source, 1);
    target.keyImports = {
      version: 1,
      keys: [
        {
          keyId: `${target.id}:hero`,
          label: "Prequel hero",
          sourceStoryId: source.id,
          sourceVersionId: "edition-1",
          sourceKeyId: `${source.id}:hero`,
          required: false,
        },
      ],
    };
    target.storyNodes.opening.title = "A sequel begins";
    target.storyNodes.opening.storyNodeType = "text-options";
    target.storyNodes.opening.choices[0].label = "Ordinary ending";
    target.storyNodes.opening.choices.push({
      ...structuredClone(target.storyNodes.opening.choices[0]),
      id: "bonus",
      label: "Welcome back, hero",
      unavailableDisplay: "hidden",
      availableWhen: {
        kind: "key",
        scope: "import",
        keyId: `${target.id}:hero`,
        present: true,
      },
    });
    await save(target, 1);
    await publish(target, 2);
    const tab = await browser.newPage({ viewport: { width, height: 950 } });
    const errors: string[] = [];
    tab.on("pageerror", (e) => errors.push(e.message));
    await tab.goto("http://127.0.0.1:5173/studio");
    await tab.getByRole("button", { name: "Sign in to create" }).click();
    await tab
      .getByRole("dialog")
      .getByRole("button", { name: "Sign in ↗" })
      .click();
    await tab.getByRole("dialog").waitFor({ state: "hidden" });
    await tab.getByRole("button", { name: new RegExp(target.title) }).click();
    const editor = tab.getByRole("region", { name: "Imported Story keys" });
    await editor
      .getByLabel("Imported key 1 label", { exact: true })
      .fill("Prequel hero verified");
    await tab.getByRole("button", { name: "Save draft", exact: true }).click();
    await tab
      .locator(".studio-status")
      .getByText("All changes saved", { exact: true })
      .waitFor();
    await tab.reload();
    await tab.getByRole("button", { name: new RegExp(target.title) }).click();
    assert.equal(
      await editor
        .getByLabel("Imported key 1 label", { exact: true })
        .inputValue(),
      "Prequel hero verified",
    );
    for (const theme of ["light", "dark"]) {
      await tab.evaluate(
        (t) => (document.documentElement.dataset.theme = t),
        theme,
      );
      await editor.scrollIntoViewIfNeeded();
      await tab.screenshot({
        animations: "disabled",
        path: `test-results/import-editor-${width}-${theme}.png`,
      });
      assert(
        await tab.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
    }
    const openStart = async () => {
      await tab.goto(`http://127.0.0.1:5173/s/${target.id}`);
      await tab
        .getByRole("button", { name: "Start a new journey", exact: true })
        .click();
      await tab
        .getByRole("heading", { name: "Bring your earned keys?" })
        .waitFor();
    };
    await openStart();
    for (const theme of ["light", "dark"]) {
      await tab.evaluate(
        (t) => (document.documentElement.dataset.theme = t),
        theme,
      );
      await tab.screenshot({
        animations: "disabled",
        path: `test-results/import-consent-${width}-${theme}.png`,
      });
      assert(
        await tab.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
    }
    await tab
      .getByRole("button", { name: "Use earned keys", exact: true })
      .click();
    await tab.getByRole("heading", { name: "A sequel begins" }).waitFor();
    assert.equal(
      await tab.getByRole("button", { name: /Welcome back, hero/ }).count(),
      0,
    );
    const pinned = tab.url();
    // Earn the key after this run has already snapshotted false.
    const begun = await api("/playthroughs", {
      idempotencyKey: randomUUID(),
      payload: { storyId: source.id },
    });
    await api(`/playthroughs/${begun.player.save.id}/choices`, {
      idempotencyKey: randomUUID(),
      expectedRevision: 0,
      payload: { choiceId: source.storyNodes.opening.choices[0].id },
    });
    await tab.reload();
    await tab.getByRole("heading", { name: "A sequel begins" }).waitFor();
    assert.equal(
      await tab.getByRole("button", { name: /Welcome back, hero/ }).count(),
      0,
    );
    await openStart();
    await tab
      .getByRole("button", { name: "Start without imported keys", exact: true })
      .click();
    await tab.getByRole("heading", { name: "A sequel begins" }).waitFor();
    assert.equal(
      await tab.getByRole("button", { name: /Welcome back, hero/ }).count(),
      0,
    );
    await openStart();
    await tab
      .getByRole("button", { name: "Use earned keys", exact: true })
      .click();
    await tab.getByRole("button", { name: /Welcome back, hero/ }).waitFor();
    await tab.reload();
    await tab.getByRole("button", { name: /Welcome back, hero/ }).click();
    await tab.getByRole("heading", { name: "The end", exact: true }).waitFor();
    await tab.goto(pinned);
    await tab.getByRole("heading", { name: "A sequel begins" }).waitFor();
    assert.equal(
      await tab.getByRole("button", { name: /Welcome back, hero/ }).count(),
      0,
    );
    // A new edition asks for an explicit completed source journey instead.
    target.keyImports!.keys[0] = {
      ...target.keyImports!.keys[0],
      selection: "completed-run",
      sourceKeyId: `${source.id}:rescued`,
      required: true,
    };
    await save(target, 3);
    await publish(target, 4);
    const rescue = await api("/playthroughs", {
      idempotencyKey: randomUUID(),
      payload: { storyId: source.id },
    });
    await api(`/playthroughs/${rescue.player.save.id}/choices`, {
      idempotencyKey: randomUUID(),
      expectedRevision: 0,
      payload: { choiceId: "rescue" },
    });
    await tab.goto("http://127.0.0.1:5173/studio");
    await tab.getByRole("button", { name: new RegExp(target.title) }).click();
    assert.equal(
      await tab
        .getByLabel("Imported key 1 source mode", { exact: true })
        .inputValue(),
      "completed-run",
    );
    await tab
      .getByLabel("Imported key 1 source mode", { exact: true })
      .selectOption("ever-earned");
    await tab
      .getByLabel("Imported key 1 source mode", { exact: true })
      .selectOption("completed-run");
    await tab.getByRole("button", { name: "Save draft", exact: true }).click();
    await tab
      .locator(".studio-status")
      .getByText("All changes saved", { exact: true })
      .waitFor();
    await tab.goto(`http://127.0.0.1:5173/s/${target.id}`);
    let failPicker = true;
    await tab.route("**/story-imports/*/*/runs?*", (route) => {
      if (failPicker) {
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            error: { code: "UNAVAILABLE", message: "Test unavailable" },
          }),
        });
      }
      return route.continue();
    });
    await tab
      .getByRole("button", { name: "Start a new journey", exact: true })
      .click();
    await tab.getByRole("button", { name: "Retry loading journeys" }).waitFor();
    failPicker = false;
    await tab.getByRole("button", { name: "Retry loading journeys" }).click();
    const picker = tab.getByLabel(`Source journey for ${source.title}`);
    await picker
      .locator(`option[value="${rescue.player.save.id}"]`)
      .waitFor({ state: "attached" });
    assert.equal(await picker.inputValue(), "");
    assert(
      await tab
        .getByRole("button", { name: "Use selected journeys", exact: true })
        .isDisabled(),
    );
    await picker.selectOption(begun.player.save.id);
    for (const theme of ["light", "dark"]) {
      await tab.evaluate(
        (t) => (document.documentElement.dataset.theme = t),
        theme,
      );
      await tab.screenshot({
        animations: "disabled",
        path: `test-results/continuity-picker-${width}-${theme}.png`,
      });
      assert(
        await tab.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
    }
    await tab
      .getByRole("button", { name: "Use selected journeys", exact: true })
      .click();
    await tab.getByRole("heading", { name: "A sequel begins" }).waitFor();
    assert.equal(
      await tab.getByRole("button", { name: /Welcome back, hero/ }).count(),
      0,
    );
    const falseContinuityUrl = tab.url();
    await tab.goto(`http://127.0.0.1:5173/s/${target.id}`);
    await tab
      .getByRole("button", { name: "Start a new journey", exact: true })
      .click();
    await picker.selectOption(rescue.player.save.id);
    await tab
      .getByRole("button", { name: "Use selected journeys", exact: true })
      .click();
    await tab.getByRole("button", { name: /Welcome back, hero/ }).waitFor();
    await tab.reload();
    await tab.getByRole("button", { name: /Welcome back, hero/ }).click();
    await tab.getByRole("heading", { name: "The end", exact: true }).waitFor();
    await tab.goto(falseContinuityUrl);
    await tab.getByRole("heading", { name: "A sequel begins" }).waitFor();
    assert.equal(
      await tab.getByRole("button", { name: /Welcome back, hero/ }).count(),
      0,
    );
    // The community directory has no creator API yet: add one emulator-only
    // branch record pointing at the already-published, immutable target edition.
    const firestore =
      "http://127.0.0.1:8080/v1/projects/demo-storybranch/databases/(default)/documents";
    const template = await (
      await fetch(`${firestore}/branches/bell-diver`, {
        headers: { authorization: "Bearer owner" },
      })
    ).json();
    const branchId = `side-import-${randomUUID()}`;
    const branchUrl = `${firestore}/branches/${branchId}`;
    const childTitle = `Side continuity ${width}`;
    const created = await fetch(branchUrl, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer owner",
      },
      body: JSON.stringify({
        fields: {
          ...template.fields,
          id: { stringValue: branchId },
          title: { stringValue: childTitle },
          storyId: { stringValue: target.id },
          versionId: { stringValue: "edition-4" },
        },
      }),
    });
    assert(created.ok, await created.text());
    try {
      const parentStart = await api("/playthroughs", {
        idempotencyKey: randomUUID(),
        payload: { storyId: "glass-harbor" },
      });
      const parent = await api(
        `/playthroughs/${parentStart.player.save.id}/choices`,
        {
          idempotencyKey: randomUUID(),
          expectedRevision: 0,
          payload: { choiceId: "market" },
        },
      );
      const parentUrl = `http://127.0.0.1:5173/play/${parent.player.save.id}`;
      await tab.goto(parentUrl);
      await tab
        .locator("summary")
        .filter({ hasText: "More community stories" })
        .click();
      await tab.getByRole("button", { name: childTitle, exact: false }).click();
      await tab.getByRole("dialog").waitFor();
      await tab.getByRole("button", { name: "Cancel key imports" }).click();
      assert.equal(tab.url(), parentUrl);
      await tab.getByRole("button", { name: childTitle, exact: false }).click();
      const childPicker = tab.getByLabel(`Source journey for ${source.title}`);
      await childPicker
        .locator(`option[value="${rescue.player.save.id}"]`)
        .waitFor({ state: "attached" });
      assert.equal(await childPicker.inputValue(), "");
      await childPicker.selectOption(rescue.player.save.id);
      for (const theme of ["light", "dark"]) {
        await tab.evaluate(
          (t) => (document.documentElement.dataset.theme = t),
          theme,
        );
        await tab.screenshot({
          animations: "disabled",
          path: `test-results/side-imports-${width}-${theme}.png`,
        });
        assert(
          await tab.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        );
      }
      await tab
        .getByRole("button", { name: "Use selected journeys", exact: true })
        .click();
      await tab.getByRole("button", { name: /Welcome back, hero/ }).waitFor();
      await tab.reload();
      await tab.getByRole("button", { name: /Welcome back, hero/ }).click();
      await tab
        .getByRole("heading", { name: "The end", exact: true })
        .waitFor();
      await tab
        .getByRole("button", { name: "Return to main adventure", exact: false })
        .click();
      await tab.waitForURL(parentUrl);
      assert.deepEqual(
        (await api(`/playthroughs/${parent.player.save.id}`)).save,
        parent.player.save,
      );
    } finally {
      await fetch(branchUrl, {
        method: "DELETE",
        headers: { authorization: "Bearer owner" },
      });
    }
    assert.deepEqual(errors, []);
    await tab.close();
  }
  console.log(
    "PASS: ever-earned imports and selected-run continuity, authoring persistence, consent/decline, missing/earned keys, picker retry, explicit conflicting-run selection, immutable snapshots, reload and shared StoryNode completion at 390/1440 in both themes.",
  );
} finally {
  await browser.close();
}
