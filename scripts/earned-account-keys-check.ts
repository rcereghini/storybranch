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
    const source = starterStory(`a-earned-source-${randomUUID()}`);
    const consumer = starterStory(`a-earned-consumer-${randomUUID()}`);
    source.title = `Earned source ${width} ${Date.now()}`;
    consumer.title = `Earned sequel ${width} ${Date.now()}`;
    consumer.storyNodes.opening.storyNodeType = "text-options";
    consumer.storyNodes.opening.choices[0].label = "Safe exit";
    consumer.storyNodes.opening.choices.push({
      ...structuredClone(consumer.storyNodes.opening.choices[0]),
      id: "earned",
      label: "Earned route",
    });
    for (const story of [source, consumer])
      await api(`/studio/${story.id}`, {
        idempotencyKey: randomUUID(),
        expectedRevision: 0,
        draft: { story, description: "Earned account key browser fixture" },
      });
    await api(`/studio/${source.id}/publish`, {
      idempotencyKey: randomUUID(),
      expectedRevision: 1,
      policyVersion: "creator-alpha-1",
    });
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
    const open = async (story: typeof source) => {
      // Scope the paginated listing to this known owned fixture; draft reads stay real.
      await tab.route("**/api/studio", (route) =>
        route.fulfill({
          json: {
            canPublish: true,
            uid: "player",
            nextCursor: null,
            items: [
              {
                id: story.id,
                title: story.title,
                revision: 1,
                publishedVersionId: null,
              },
            ],
          },
        }),
      );
      await tab.goto("http://127.0.0.1:5173/studio");
      await tab.getByRole("button", { name: new RegExp(story.title) }).click();
    };
    const pane = async (name: "StoryNode" | "StoryTrunk") => {
      const nav = tab.locator(".studio-views");
      if (await nav.isVisible())
        await nav
          .getByRole("button", { name: /^(StoryTrunk|Edit StoryNode)$/ })
          .click();
      await tab
        .locator(".studio-panel .studio-tabs")
        .getByRole("button", { name, exact: true })
        .click();
    };
    await open(source);
    await pane("StoryNode");
    await tab
      .getByLabel("Edit StoryNode", { exact: true })
      .selectOption("ending");
    const submission = tab.getByRole("region", {
      name: "Account achievement submission",
    });
    await submission
      .getByLabel("Achievement title", { exact: true })
      .fill(`Sequel hero ${width}`);
    await submission
      .getByLabel("Achievement consumer Stories")
      .fill(consumer.id);
    const submitted = tab.waitForResponse(
      (r) =>
        r.url().endsWith("/api/achievement-submissions") &&
        r.request().method() === "POST",
    );
    await submission
      .getByRole("button", { name: "Submit for approval", exact: true })
      .click();
    const definition = await (await submitted).json();
    assert.deepEqual(definition.consumerStoryIds, [consumer.id]);
    await tab.goto("http://127.0.0.1:5173/admin/achievements");
    const review = tab.locator("article").filter({
      has: tab.getByRole("heading", { name: definition.title, exact: true }),
    });
    await review
      .getByText(`Account key consumers: ${consumer.id}`, { exact: true })
      .waitFor();
    await review
      .getByLabel(`Review reason for ${definition.title}`)
      .fill("Approved sequel key");
    await review.getByRole("button", { name: "Approve", exact: true }).click();
    await review.getByText("Status: approved", { exact: true }).waitFor();
    let failMore = true;
    const listed = { ...definition, status: "approved" };
    await tab.route("**/api/achievement-submissions*", async (route) => {
      const url = new URL(route.request().url());
      if (
        url.pathname !== "/api/achievement-submissions" ||
        route.request().method() !== "GET"
      )
        return route.continue();
      if (!url.searchParams.has("cursor"))
        return route.fulfill({
          json: {
            items: [
              {
                ...listed,
                id: "retained-choice",
                title: "Earlier eligible choice",
              },
              {
                ...listed,
                id: "pending-choice",
                title: "Pending choice",
                status: "pending",
              },
              {
                ...listed,
                id: "unpermitted-choice",
                title: "Other Story choice",
                consumerStoryIds: [],
              },
            ],
            nextCursor: "picker-next",
          },
        });
      assert.equal(url.searchParams.get("cursor"), "picker-next");
      if (failMore) {
        failMore = false;
        return route.fulfill({
          status: 503,
          json: {
            error: {
              code: "UNAVAILABLE",
              message: "Temporary listing failure",
            },
          },
        });
      }
      return route.fulfill({ json: { items: [listed], nextCursor: null } });
    });
    await open(consumer);
    const earned = tab.getByRole("region", {
      name: "Earned account key settings",
    });
    const picker = earned.getByLabel("Approved achievement");
    await picker.selectOption("retained-choice");
    assert.equal(
      await picker
        .getByRole("option", { name: /Pending choice|Other Story choice/ })
        .count(),
      0,
    );
    await earned
      .getByRole("button", { name: "Load more achievements" })
      .click();
    await earned.getByText(/Temporary listing failure/).waitFor();
    assert.equal(await picker.inputValue(), "retained-choice");
    await earned
      .getByRole("button", { name: "Load more achievements" })
      .click();
    await earned.getByLabel("Approved achievement").selectOption(definition.id);
    await earned
      .getByRole("button", { name: "Bind earned account key" })
      .click();
    await earned.getByText(/Achievement bound/).waitFor();
    for (const theme of ["light", "dark"]) {
      await tab.evaluate((t) => {
        document.documentElement.dataset.theme = t;
      }, theme);
      await earned.scrollIntoViewIfNeeded();
      assert(
        await tab.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await tab.screenshot({
        path: `test-results/earned-account-${width}-${theme}.png`,
        animations: "disabled",
      });
    }
    await pane("StoryNode");
    await tab
      .getByLabel("Edit StoryNode", { exact: true })
      .selectOption("opening");
    await tab
      .getByLabel("Option 2 persistent key", { exact: true })
      .selectOption({ label: `${definition.title} (earned account)` });
    await tab.getByRole("button", { name: "Save draft", exact: true }).click();
    await tab
      .locator(".studio-status")
      .getByText("All changes saved", { exact: true })
      .waitFor();
    await tab.getByRole("button", { name: "Preview", exact: true }).click();
    const preview = tab.getByRole("dialog", { name: "Private preview" });
    await preview
      .getByRole("heading", { name: "Opening", exact: true })
      .waitFor();
    assert.equal(
      await preview.getByRole("button", { name: /Earned route/ }).count(),
      0,
    );
    await preview.getByText("Test key scenarios", { exact: true }).click();
    await preview
      .getByRole("checkbox", { name: new RegExp(definition.title) })
      .check();
    await preview.getByRole("button", { name: /Earned route/ }).click();
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
    const guest = await browser.newPage({ viewport: { width, height: 950 } });
    guest.on("pageerror", (e) => errors.push(e.message));
    await guest.goto(`http://127.0.0.1:5173/s/${consumer.id}`);
    await guest
      .getByRole("button", { name: /Sign in/ })
      .first()
      .click();
    await guest
      .getByRole("dialog")
      .getByLabel("Email", { exact: true })
      .fill("progressed@storybranch.test");
    await guest
      .getByRole("dialog")
      .getByRole("button", { name: "Sign in ↗" })
      .click();
    await guest.getByRole("dialog").waitFor({ state: "hidden" });
    await guest
      .getByRole("button", { name: "Start a new journey", exact: true })
      .click();
    await guest
      .getByRole("heading", { name: "Opening", exact: true })
      .waitFor();
    const journey = guest.url();
    assert.equal(
      await guest.getByRole("button", { name: /Earned route/ }).count(),
      0,
    );
    await guest.goto(`http://127.0.0.1:5173/s/${source.id}`);
    await guest
      .getByRole("button", { name: "Start a new journey", exact: true })
      .click();
    await guest
      .getByRole("heading", { name: "Opening", exact: true })
      .waitFor();
    await guest
      .getByRole("button", { name: /Continue|Next/ })
      .first()
      .click();
    await guest
      .getByRole("heading", { name: "The end", exact: true })
      .waitFor();
    await guest
      .getByText(`Account achievement: ${definition.title}`, { exact: true })
      .waitFor();
    await guest.goto(journey);
    await guest.getByRole("button", { name: /Earned route/ }).waitFor();
    await api(`/admin/achievements/${definition.id}`, {
      idempotencyKey: randomUUID(),
      expectedRevision: 2,
      status: "revoked",
      reason: "Verify stale option recovery",
    });
    await guest.getByRole("button", { name: /Earned route/ }).click();
    await guest
      .getByRole("button", { name: "Reload current progress", exact: true })
      .click();
    await guest
      .getByRole("button", { name: /Earned route/ })
      .waitFor({ state: "hidden" });
    await guest.getByRole("button", { name: /Safe exit/ }).click();
    await guest
      .getByRole("heading", { name: "The end", exact: true })
      .waitFor();
    assert.deepEqual(errors, []);
    await guest.close();
    await tab.close();
  }
  console.log(
    "PASS: reviewed consumer permissions, earned account binding/preview, real source completion, sequel unlock and revocation recovery at desktop/mobile.",
  );
} finally {
  await browser.close();
}
