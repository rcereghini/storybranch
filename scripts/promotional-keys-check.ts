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
    const story = starterStory(`a-promo-${randomUUID()}`);
    story.title = `Promotional flow ${width} ${Date.now()}`;
    story.storyNodes.opening.storyNodeType = "text-options";
    story.storyNodes.opening.choices[0].label = "Safe exit";
    story.storyNodes.opening.choices.push({
      ...structuredClone(story.storyNodes.opening.choices[0]),
      id: "bonus",
      label: "Bonus option",
    });
    await api(`/studio/${story.id}`, {
      idempotencyKey: randomUUID(),
      expectedRevision: 0,
      draft: { story, description: "Promotional browser fixture" },
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
    await tab.getByRole("button", { name: new RegExp(story.title) }).click();
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
    await pane("StoryTrunk");
    const editor = tab.getByRole("region", {
      name: "Promotional key settings",
    });
    const label = `Bonus access ${width} ${Date.now()}`;
    await editor
      .getByLabel("Promotional key label", { exact: true })
      .fill(label);
    await editor.getByLabel("Promotional maximum recipients").fill("1");
    await editor
      .getByRole("button", { name: "Create promotional code" })
      .click();
    const codeField = editor.getByLabel("New promotional code", {
      exact: true,
    });
    await codeField.waitFor();
    const code = await codeField.inputValue();
    assert.match(code, /^[a-f0-9]{48}$/);
    const row = editor.getByRole("listitem").filter({ hasText: label });
    await row.getByRole("button", { name: "Use in this Story" }).click();
    await pane("StoryNode");
    await tab
      .getByLabel("Edit StoryNode", { exact: true })
      .selectOption("opening");
    await tab
      .getByLabel("Option 2 persistent key", { exact: true })
      .selectOption({ label: `${label} (promotional)` });
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
      await preview.getByRole("button", { name: /Bonus option/ }).count(),
      0,
    );
    await preview.getByText("Test key scenarios", { exact: true }).click();
    await preview.getByRole("checkbox", { name: new RegExp(label) }).check();
    await preview.getByRole("button", { name: /Bonus option/ }).click();
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
    await guest.goto("http://127.0.0.1:5173/adventures");
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
    await guest.goto(`http://127.0.0.1:5173/s/${story.id}`);
    await guest
      .getByRole("button", { name: "Start a new journey", exact: true })
      .click();
    await guest
      .getByRole("heading", { name: "Opening", exact: true })
      .waitFor();
    const journey = guest.url();
    assert.equal(
      await guest.getByRole("button", { name: /Bonus option/ }).count(),
      0,
    );
    await guest.goto("http://127.0.0.1:5173/adventures");
    let lost = false;
    let commandKey = "";
    await guest.route("**/api/promotional-key-grants", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      const body = route.request().postDataJSON();
      if (commandKey) assert.equal(body.idempotencyKey, commandKey);
      commandKey = body.idempotencyKey;
      const response = await route.fetch();
      if (!lost) {
        lost = true;
        assert.equal(response.status(), 200);
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            error: { code: "UNAVAILABLE", message: "Response lost" },
          }),
        });
      }
      return route.fulfill({ response });
    });
    const wallet = guest.getByRole("region", { name: "My promotional keys" });
    await wallet.getByLabel("Promotional code", { exact: true }).fill(code);
    await wallet
      .getByRole("button", { name: "Redeem promotional code", exact: true })
      .click();
    await wallet
      .getByRole("button", { name: "Retry redemption", exact: true })
      .click();
    await wallet.getByText(label, { exact: true }).waitFor();
    const grant = wallet.getByRole("listitem").filter({ hasText: label });
    await grant.getByText("Status: active", { exact: true }).waitFor();
    assert.equal(
      await wallet.getByLabel("Promotional code", { exact: true }).inputValue(),
      "",
    );
    for (const theme of ["light", "dark"]) {
      await guest.evaluate(
        (t) => (document.documentElement.dataset.theme = t),
        theme,
      );
      await wallet.scrollIntoViewIfNeeded();
      assert(
        await guest.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await guest.screenshot({
        path: `test-results/promotional-wallet-${width}-${theme}.png`,
        animations: "disabled",
      });
    }
    await guest.goto(journey);
    await guest.getByRole("button", { name: /Bonus option/ }).waitFor();
    await pane("StoryTrunk");
    await editor
      .getByRole("button", { name: "Reload keys", exact: true })
      .click();
    await row.getByText(/1\/1 recipients/).waitFor();
    for (const theme of ["light", "dark"]) {
      await tab.evaluate(
        (t) => (document.documentElement.dataset.theme = t),
        theme,
      );
      await row.scrollIntoViewIfNeeded();
      assert(
        await tab.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await tab.screenshot({
        path: `test-results/promotional-creator-${width}-${theme}.png`,
        animations: "disabled",
      });
    }
    await row
      .getByRole("button", { name: "Revoke promotional key", exact: true })
      .click();
    await row.getByText(/Revoked/).waitFor();
    await guest.getByRole("button", { name: /Bonus option/ }).click();
    await guest
      .getByRole("button", { name: "Reload current progress", exact: true })
      .click();
    await guest.getByRole("button", { name: /Safe exit/ }).waitFor();
    await guest
      .getByRole("button", { name: /Bonus option/ })
      .waitFor({ state: "hidden" });
    assert.equal(
      await guest.getByRole("button", { name: /Bonus option/ }).count(),
      0,
    );
    await guest.getByRole("button", { name: /Safe exit/ }).click();
    await guest
      .getByRole("heading", { name: "The end", exact: true })
      .waitFor();
    await guest.goto("http://127.0.0.1:5173/adventures");
    await guest
      .getByRole("region", { name: "My promotional keys" })
      .getByRole("listitem")
      .filter({ hasText: label })
      .getByText("Status: revoked", { exact: true })
      .waitFor();
    assert.deepEqual(errors, []);
    await guest.close();
    await tab.close();
  }
  console.log(
    "PASS: promotional issuance/binding/preview, redemption retry, history and live revocation recovery in desktop/mobile Chrome.",
  );
} finally {
  await browser.close();
}
