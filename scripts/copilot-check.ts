// Browser check for the Copilot drawer. The Copilot API is faked in the StoryNode
// (no model calls, no key); the app, sign-in and navigation are real.
import assert from "node:assert/strict";
import { launchBrowser } from "./browser";

const browser = await launchBrowser();
try {
  const tab = await (
    await browser.newContext({ viewport: { width: 1024, height: 900 } })
  ).newPage();
  const errors: string[] = [];
  tab.on("pageerror", (e) => errors.push(e.message));
  const sent: Array<{ text: string; context: { path: string } }> = [];
  // CI has no Anthropic key, so the real profile reports Copilot as
  // unusable; switch it on in the response to exercise the drawer.
  await tab.route("**/api/profile", async (route) => {
    const response = await route.fetch();
    const profile = await response.json();
    await route.fulfill({
      response,
      json: { ...profile, features: { ...profile.features, copilot: true } },
    });
  });
  await tab.route("**/api/copilot/threads/*", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({
        json: { enabled: true, reason: null, full: false, messages: [] },
      });
    const body = route.request().postDataJSON();
    sent.push(body);
    const events = /studio/i.test(body.text)
      ? [
          { type: "tool", name: "navigate" },
          { type: "action", action: { kind: "navigate", path: "/studio" } },
          { type: "text", text: "Here's Studio." },
          { type: "done" },
        ]
      : body.text === "Fail please"
        ? [
            {
              type: "error",
              code: "UNAVAILABLE",
              message: "Copilot is unavailable right now.",
            },
          ]
        : [
            { type: "tool", name: "list_my_drafts" },
            { type: "text", text: "You have " },
            { type: "text", text: "no drafts yet." },
            { type: "done" },
          ];
    await route.fulfill({
      contentType: "application/x-ndjson",
      body: events.map((e) => JSON.stringify(e) + "\n").join(""),
    });
  });

  await tab.goto("http://127.0.0.1:5173/discover");
  await tab.getByRole("button", { name: "Sign in" }).first().click();
  await tab
    .getByRole("dialog")
    .getByRole("button", { name: "Sign in ↗", exact: true })
    .click();
  await tab.getByRole("dialog").waitFor({ state: "hidden" });
  await tab.waitForLoadState("networkidle");

  const layout = () =>
    tab.evaluate(() => ({
      main: JSON.stringify(
        document.querySelector("main")!.getBoundingClientRect(),
      ),
      overflow: document.documentElement.scrollWidth > innerWidth,
    }));
  // Measure only once fonts and images have settled the layout.
  await tab.evaluate(() => document.fonts.ready);
  let before = await layout();
  for (let i = 0; i < 20; i++) {
    await tab.waitForTimeout(250);
    const next = await layout();
    if (next.main === before.main) break;
    before = next;
  }
  const toggle = tab.getByRole("button", { name: "Copilot", exact: true });
  await toggle.click();
  const drawer = tab.getByRole("complementary", { name: "Copilot" });
  await drawer.waitFor();
  const opened = await layout();
  assert.equal(
    opened.main,
    before.main,
    `Opening Copilot moved StoryNode content: ${before.main} -> ${opened.main}`,
  );
  assert.equal(opened.overflow, false, "Horizontal overflow with Copilot open");

  // A streamed reply arrives in pieces and reads as one message.
  await drawer.getByRole("button", { name: "Show me my drafts" }).click();
  await drawer.getByText("You have no drafts yet.", { exact: true }).waitFor();
  assert.equal(sent[0].context.path, "/discover");

  // An action navigates the app; the drawer stays open on the new StoryNode.
  await drawer.getByLabel("Message Copilot").fill("Take me to Studio");
  await drawer.getByLabel("Message Copilot").press("Enter");
  await tab.waitForURL("**/studio");
  await drawer.getByText("Here's Studio.", { exact: true }).waitFor();

  // A failed reply shows in the reserved status line and can be retried.
  await drawer.getByLabel("Message Copilot").fill("Fail please");
  await drawer.getByLabel("Message Copilot").press("Enter");
  await drawer.getByRole("button", { name: "Retry" }).waitFor();
  const failedKeys = sent.filter((s) => s.text === "Fail please");
  await drawer.getByRole("button", { name: "Retry" }).click();
  await tab.waitForFunction(
    () => document.querySelectorAll(".copilot-error").length === 1,
  );
  const retried = sent.filter((s) => s.text === "Fail please") as Array<{
    idempotencyKey?: string;
  }>;
  assert.equal(retried.length, failedKeys.length + 1);
  assert.equal(
    retried[0].idempotencyKey,
    retried[1].idempotencyKey,
    "Retry must reuse its key",
  );

  // Escape closes it; play StoryNodes never offer it.
  await tab.keyboard.press("Escape");
  await drawer.waitFor({ state: "hidden" });
  await tab.setViewportSize({ width: 390, height: 844 });
  await toggle.click();
  assert.equal(
    (await layout()).overflow,
    false,
    "Horizontal overflow on phone",
  );
  await tab.goto("http://127.0.0.1:5173/play/not-a-save");
  assert.equal(await toggle.count(), 0, "Copilot offered during play");
  assert.deepEqual(errors, []);
  console.log(
    "Copilot PASS: drawer, streaming, navigate action, retry with the same key, no layout shift, hidden during play.",
  );
} finally {
  await browser.close();
}
