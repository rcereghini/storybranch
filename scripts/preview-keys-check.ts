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
    const story = starterStory(`preview-${randomUUID()}`);
    story.title = `Preview keys ${width} ${Date.now()}`;
    story.progression = {
      version: 1,
      keys: [
        {
          keyId: `${story.id}:hero`,
          label: "Returning hero",
          afterCompletions: 5,
        },
      ],
    };
    story.keyImports = {
      version: 1,
      keys: [
        {
          keyId: `${story.id}:relic`,
          label: "Prequel relic",
          sourceStoryId: "unpublished-source",
          sourceVersionId: "v1",
          sourceKeyId: "unpublished-source:relic",
          required: true,
        },
      ],
    };
    const opening = story.storyNodes.opening;
    opening.storyNodeType = "text-options";
    opening.choices[0].label = "Safe exit";
    opening.choices.push(
      {
        ...structuredClone(opening.choices[0]),
        id: "hero",
        label: "Hero exit",
        unavailableDisplay: "hidden",
        availableWhen: {
          kind: "key",
          scope: "story",
          keyId: `${story.id}:hero`,
          present: true,
        },
      },
      {
        ...structuredClone(opening.choices[0]),
        id: "relic",
        label: "Relic exit",
        unavailableDisplay: "locked",
        availableWhen: {
          kind: "key",
          scope: "import",
          keyId: `${story.id}:relic`,
          present: true,
        },
      },
    );
    await api(`/studio/${story.id}`, {
      idempotencyKey: randomUUID(),
      expectedRevision: 0,
      draft: { story, description: "Disposable preview fixture" },
    });
    const before = await api(`/studio/${story.id}`);
    const tab = await browser.newPage({ viewport: { width, height: 950 } });
    const errors: string[] = [];
    const playerWrites: string[] = [];
    tab.on("pageerror", (e) => errors.push(e.message));
    tab.on("request", (r) => {
      if (
        r.method() === "POST" &&
        /\/api\/(playthroughs|story-progress|story-entry)/.test(r.url())
      )
        playerWrites.push(r.url());
    });
    await tab.goto("http://127.0.0.1:5173/studio");
    await tab.getByRole("button", { name: "Sign in to create" }).click();
    await tab
      .getByRole("dialog")
      .getByRole("button", { name: "Sign in ↗" })
      .click();
    await tab.getByRole("button", { name: new RegExp(story.title) }).click();
    await tab.getByRole("button", { name: "Preview", exact: true }).click();
    const preview = tab.getByRole("dialog", { name: "Private preview" });
    const button = (name: string) =>
      preview.getByRole("button", { name: new RegExp(name) });
    await preview
      .getByRole("heading", { name: "Opening", exact: true })
      .waitFor();
    assert.equal(await button("Hero exit").count(), 0);
    assert(await button("Relic exit").isDisabled());
    await preview.getByText("Test key scenarios", { exact: true }).click();
    await preview.getByText("Why these options?", { exact: true }).click();
    await preview.getByText("Hero exit — Hidden", { exact: true }).waitFor();
    await button("Returning player").click();
    assert(await button("Hero exit").isEnabled());
    await preview.getByText("Hero exit — Visible", { exact: true }).waitFor();
    await button("Hero exit").click();
    await preview
      .getByRole("heading", { name: "The end", exact: true })
      .waitFor();
    await button("Play preview again").click();
    assert(await button("Hero exit").isEnabled());
    await button("Sequel with item").click();
    assert.equal(await button("Hero exit").count(), 0);
    assert(await button("Relic exit").isEnabled());
    await preview.getByRole("checkbox", { name: /Prequel relic/ }).uncheck();
    assert(await button("Relic exit").isDisabled());
    await preview.getByRole("checkbox", { name: /Prequel relic/ }).check();
    await button("Relic exit").click();
    await preview
      .getByRole("heading", { name: "The end", exact: true })
      .waitFor();
    await button("First playthrough").click();
    await preview
      .getByRole("heading", { name: "Opening", exact: true })
      .waitFor();
    assert(await button("Relic exit").isDisabled());
    for (const theme of ["light", "dark"]) {
      await tab.evaluate(
        (t) => (document.documentElement.dataset.theme = t),
        theme,
      );
      assert(await preview.evaluate((el) => el.scrollWidth <= el.clientWidth));
      await preview.locator(".studio-preview-stage").evaluate((el) => {
        el.scrollTop = 0;
      });
      await tab.screenshot({
        path: `test-results/preview-keys-${width}-${theme}.png`,
        animations: "disabled",
      });
      await preview.getByText("Test key scenarios", { exact: true }).click();
      await preview.locator(".studio-preview-stage").evaluate((el) => {
        el.scrollTop = 0;
      });
      await tab.screenshot({
        path: `test-results/preview-diagnostics-${width}-${theme}.png`,
        animations: "disabled",
      });
      await preview.getByText("Test key scenarios", { exact: true }).click();
    }
    await button("Returning player").click();
    await button("Close preview").click();
    await tab.getByRole("button", { name: "Preview", exact: true }).click();
    assert.equal(await button("Hero exit").count(), 0);
    await button("Close preview").click();
    assert.deepEqual(await api(`/studio/${story.id}`), before);
    assert.deepEqual(playerWrites, []);
    assert.deepEqual(errors, []);
    await tab.close();
  }
  console.log(
    "PASS: declared Story/import scenarios, diagnostics, reset/replay/isolation at desktop/mobile in both themes.",
  );
} finally {
  await browser.close();
}
