// Browser check for the admin dashboard against the seeded emulator, where
// "player" is the local admin and "progressed" a member.
import assert from "node:assert/strict";
import { launchBrowser } from "./browser";

const browser = await launchBrowser();
try {
  const context = await browser.newContext({
    viewport: { width: 1024, height: 900 },
  });
  const tab = await context.newPage();
  const errors: string[] = [];
  tab.on("pageerror", (e) => errors.push(e.message));
  const overflow = () =>
    tab.evaluate(() => document.documentElement.scrollWidth > innerWidth);

  await tab.goto("http://127.0.0.1:5173/discover");
  await tab.getByRole("button", { name: "Sign in" }).first().click();
  await tab
    .getByRole("dialog")
    .getByRole("button", { name: "Sign in ↗", exact: true })
    .click();
  await tab.getByRole("dialog").waitFor({ state: "hidden" });
  // Admin is in the account menu, only for admins.
  const menu = tab.getByRole("button", { name: "Account menu" });
  await menu.click();
  // The seeded admin signed up with a password and hasn't confirmed, so the
  // menu offers another confirmation email; the result replaces the prompt.
  const accountMenu = tab.locator("#account-menu");
  await accountMenu.getByText("Email not confirmed.").waitFor();
  await accountMenu.getByRole("button", { name: "Resend" }).click();
  await accountMenu
    .getByText("Sent. Check your inbox and spam folder.")
    .waitFor();
  await accountMenu.getByRole("button", { name: "Admin", exact: true }).click();
  await tab.waitForURL("**/admin");
  // The Overview: headline numbers, what needs attention, services, the
  // most played stories, recent changes and the totals strip.
  await tab.getByRole("heading", { name: "Needs attention" }).waitFor();
  await tab.getByText("New sign-ups", { exact: true }).waitFor();
  await tab.getByRole("heading", { name: "Services" }).waitFor();
  await tab.getByText(/\d+ Published stories/).waitFor();
  await tab.getByText("Local emulators").waitFor();
  await tab.getByRole("button", { name: "7 days" }).click();
  await tab.getByText("Last 7 days, compared with the 7 before.").waitFor();
  await tab.getByRole("button", { name: "30 days" }).click();
  await tab.getByText("Last 30 days, compared with the 30 before.").waitFor();
  assert.equal(await overflow(), false, "Horizontal overflow on Admin at 1024");
  await tab.waitForTimeout(300);
  await tab.screenshot({
    path: "test-results/admin-overview.png",
    fullPage: true,
  });
  await tab.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await overflow(),
    false,
    "Horizontal overflow on Overview at 390",
  );
  await tab.screenshot({
    path: "test-results/admin-overview-phone.png",
    fullPage: true,
  });
  await tab.setViewportSize({ width: 1024, height: 900 });

  // Users: turn a member's Copilot off and back on.
  const sections = tab.getByRole("navigation", { name: "Admin sections" });
  await sections.getByRole("link", { name: "Users" }).click();
  // Search runs on the server; both seeded accounts match.
  await tab.getByLabel("Search users").fill("storybranch.test");
  await tab.getByText(/^\d+ accounts?$/).waitFor();
  const row = tab.getByRole("row", { name: /progressed@storybranch\.test/ });
  const copilot = row.getByRole("checkbox", { name: "Copilot" });
  await copilot.waitFor();
  assert.equal(await copilot.isChecked(), true);
  await copilot.click();
  await tab.waitForFunction(
    () =>
      ![...document.querySelectorAll("tr")]
        .find((r) => r.textContent?.includes("progressed@storybranch.test"))
        ?.querySelector<HTMLInputElement>("label:nth-child(3) input")?.checked,
  );
  await copilot.click();
  await tab.waitForFunction(
    () =>
      ![...document.querySelectorAll("tr")]
        .find((r) => r.textContent?.includes("progressed@storybranch.test"))
        ?.querySelector<HTMLInputElement>("input:disabled:not([title])"),
  );
  assert.equal(await copilot.isChecked(), true);
  await tab.screenshot({ path: "test-results/admin-users.png" });
  // The admin's own admin flag and account controls are locked.
  const self = tab.getByRole("row", { name: /player@storybranch\.test/ });
  assert.equal(
    await self.getByRole("checkbox", { name: "Admin" }).isDisabled(),
    true,
  );
  assert.equal(await self.getByRole("button", { name: "Disable" }).count(), 0);

  // A member's detail page: give them their own AI limit, then remove it.
  await tab.getByLabel("Status").selectOption("disabled");
  await tab.getByText("No accounts match.").waitFor();
  await tab.getByLabel("Status").selectOption("all");
  await row.getByRole("button", { name: "Progressed", exact: false }).click();
  // The account opens in a drawer with its own address.
  await tab.waitForURL("**/admin/users/progressed");
  await tab.getByRole("heading", { name: "Daily limits" }).waitFor();
  await tab.getByText("Email and password").waitFor();
  const aiLimit = tab.getByLabel("AI requests per day");
  await aiLimit.fill("5");
  await tab.getByRole("button", { name: "Save limits" }).click();
  await tab.getByText("Limits saved.").waitFor();
  await tab.getByText(/Used today: \d+ of 5 \(own limit\)/).waitFor();
  await tab
    .getByText(/set daily limits to 5 AI requests/)
    .first()
    .waitFor();
  await tab.screenshot({ path: "test-results/admin-user.png", fullPage: true });
  await aiLimit.fill("");
  await tab.getByRole("button", { name: "Save limits" }).click();
  await tab.getByText(/Used today: \d+ of 100 \(default\)/).waitFor();
  await tab.setViewportSize({ width: 390, height: 844 });
  assert.equal(await overflow(), false, "Horizontal overflow on a user at 390");
  await tab.setViewportSize({ width: 1024, height: 900 });
  await tab.getByRole("button", { name: "Close account panel" }).click();
  await tab.waitForURL("**/admin/users");
  await row.waitFor();
  // Back reopens it; forward closes it again.
  await tab.goBack();
  await tab.getByRole("heading", { name: "Daily limits" }).waitFor();
  await tab.goForward();
  await tab.waitForURL("**/admin/users");
  assert.equal(
    await tab.getByRole("heading", { name: "Daily limits" }).count(),
    0,
  );

  // Stories: hide and show a story.
  await sections.getByRole("link", { name: "Stories" }).click();
  const story = tab.getByRole("row", { name: /The Glass Harbor/ });
  await story.getByRole("button", { name: "Hide from Discover" }).click();
  await story.getByText("Hidden", { exact: true }).waitFor();
  await story.getByRole("button", { name: "Show in Discover" }).click();
  await story.getByText("Listed", { exact: true }).waitFor();
  // A story's page: play, editions and its own admin history.
  await story.getByRole("button", { name: "The Glass Harbor" }).click();
  await tab.getByRole("heading", { name: "Editions" }).waitFor();
  await tab.getByText(/· current/).waitFor();
  await tab
    .getByText("showed story glass-harbor in Discover", { exact: false })
    .first()
    .waitFor();
  await tab.screenshot({
    path: "test-results/admin-story.png",
    fullPage: true,
  });
  await tab.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await overflow(),
    false,
    "Horizontal overflow on a story at 390",
  );
  await tab.setViewportSize({ width: 1024, height: 900 });
  await tab.getByRole("button", { name: "Close story panel" }).click();
  await story.waitFor();
  // A story's address opens it directly, after a reload too.
  await tab.goto("http://127.0.0.1:5173/admin/stories/glass-harbor");
  await tab.getByRole("heading", { name: "Editions" }).waitFor();
  await tab.getByRole("button", { name: "Close story panel" }).click();
  await tab.waitForURL("**/admin/stories");

  // Activity lists those changes, newest first, and filters by type.
  await sections.getByRole("link", { name: "Activity" }).click();
  await tab
    .getByText("showed story glass-harbor in Discover", { exact: false })
    .first()
    .waitFor();
  await tab
    .getByText("turned on Copilot for progressed", { exact: false })
    .first()
    .waitFor();
  await tab.getByLabel("Type").selectOption("story");
  await tab.waitForFunction(
    () =>
      !document.body.textContent?.includes("turned on Copilot for progressed"),
  );
  await tab
    .getByText("showed story glass-harbor in Discover", { exact: false })
    .first()
    .waitFor();
  await tab.getByLabel("Type").selectOption("");

  // Usage & spend: one bar per day, the period switch, and a readout that
  // answers hover in place.
  await sections.getByRole("link", { name: "Usage & spend" }).click();
  const bars = tab.locator(".admin-bar");
  await tab.getByRole("heading", { name: "AI usage and spend" }).waitFor();
  await bars.first().waitFor();
  assert.equal(await bars.count(), 30);
  const readout = tab.locator(".admin-readout");
  const plot = await tab.locator(".admin-plot").boundingBox();
  await bars.last().hover();
  await tab
    .getByText(/requests, \$\d+\.\d\d estimated|requests, <\$0\.01 estimated/)
    .first()
    .waitFor();
  assert.match((await readout.textContent()) ?? "", /requests/);
  assert.deepEqual(
    await tab.locator(".admin-plot").boundingBox(),
    plot,
    "Hovering a day moved the chart",
  );
  await tab.getByRole("button", { name: "7 days" }).click();
  await tab.waitForFunction(
    () => document.querySelectorAll(".admin-bar").length === 7,
  );
  assert.equal(
    await tab
      .getByRole("button", { name: "7 days" })
      .getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(
    await tab
      .getByRole("button", { name: "30 days" })
      .getAttribute("aria-pressed"),
    "false",
  );
  // Buttons fade their background; let it settle before the screenshot.
  await tab.waitForTimeout(300);
  await tab.screenshot({ path: "test-results/admin-usage.png" });

  // Analytics: totals, sign-ups per day, the story table and Vercel's link.
  await sections.getByRole("link", { name: "Analytics" }).click();
  await tab.getByRole("heading", { name: "Players and stories" }).waitFor();
  await tab.getByText("Active this week").waitFor();
  await tab.waitForFunction(
    () => document.querySelectorAll(".admin-bar").length === 30,
  );
  await tab
    .getByRole("row", { name: /The Glass Harbor/ })
    .first()
    .waitFor();
  assert.equal(
    await tab
      .getByRole("link", { name: "Open Vercel Analytics ↗" })
      .getAttribute("href"),
    "https://vercel.com/opin-projects/storybranch/analytics",
  );
  await tab.getByRole("button", { name: "90 days" }).click();
  await tab.waitForFunction(
    () => document.querySelectorAll(".admin-bar").length === 90,
  );
  await tab.waitForTimeout(300);
  await tab.screenshot({
    path: "test-results/admin-analytics.png",
    fullPage: true,
  });
  await tab.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await overflow(),
    false,
    "Horizontal overflow on Analytics at 390",
  );
  await tab.setViewportSize({ width: 1024, height: 900 });

  // Emails: edit with a live preview, save a draft, publish, see history.
  await sections.getByRole("link", { name: "Emails" }).click();
  await tab.getByRole("tab", { name: /Password reset/ }).click();
  const editor = tab.getByRole("region", { name: "Edit Password reset" });
  const subject = editor.getByLabel("Subject", { exact: true });
  await subject.fill("Pick a new Storybranch password");
  const frame = tab.getByTitle("Password reset preview");
  await tab.waitForFunction(() =>
    document
      .querySelector('iframe[title="Password reset preview"]')
      ?.getAttribute("srcdoc")
      ?.includes("Pick a new Storybranch password"),
  );
  // A placeholder we don't support is caught before saving.
  await editor.getByLabel("Heading", { exact: true }).fill("Hi {{email}}");
  await editor.getByText(/Heading: Only these placeholders/).waitFor();
  assert.equal(
    await editor.getByRole("button", { name: "Save draft" }).isDisabled(),
    true,
  );
  await editor
    .getByLabel("Heading", { exact: true })
    .fill("Reset your password, {{name}}");
  await editor.getByRole("button", { name: "Save draft" }).click();
  await tab.getByText("Draft saved.", { exact: false }).waitFor();
  await tab
    .getByRole("tab", { name: /Password reset/ })
    .getByText("Unpublished changes")
    .waitFor();
  const publish = editor.getByRole("button", { name: "Publish" });
  await publish.click();
  await editor.getByRole("button", { name: "Confirm publish" }).click();
  await tab.getByText("Published version 1.").waitFor();
  await tab.getByText(/Version 1 · being sent/).waitFor();
  // CI has no Anthropic key, so the AI box explains itself.
  await editor.getByText("AI writing help isn't connected here.").waitFor();
  await tab.getByRole("button", { name: "Phone" }).click();
  assert.equal(await frame.isVisible(), true);
  await tab.waitForTimeout(300);
  await tab.screenshot({
    path: "test-results/admin-emails.png",
    fullPage: true,
  });

  // Settings: a change is summarized before saving, saved, and audited.
  await sections.getByRole("link", { name: "Settings" }).click();
  await tab.getByText("Using the built-in defaults").waitFor();
  const imageSwitch = tab.getByRole("checkbox", { name: /Image generation/ });
  assert.equal(await imageSwitch.isChecked(), true);
  await imageSwitch.uncheck();
  await tab.getByText("Saving changes: Image generation on → off.").waitFor();
  await tab.getByLabel("Images per person per day").fill("-3");
  await tab.getByText(/Images per person per day: /).waitFor();
  assert.equal(
    await tab.getByRole("button", { name: "Save settings" }).isDisabled(),
    true,
  );
  await tab.getByLabel("Images per person per day").fill("100");
  await tab.getByRole("button", { name: "Save settings" }).click();
  await tab.getByText("Settings saved.", { exact: false }).waitFor();
  await tab.getByText(/Last changed .* by player@storybranch\.test/).waitFor();
  await tab.screenshot({
    path: "test-results/admin-settings.png",
    fullPage: true,
  });
  await sections.getByRole("link", { name: "Activity" }).click();
  await tab
    .getByText("changed settings: Image generation on → off", {
      exact: false,
    })
    .first()
    .waitFor();
  // Back to the defaults, so later checks see the usual app.
  await sections.getByRole("link", { name: "Settings" }).click();
  await tab.getByRole("button", { name: "Restore defaults" }).click();
  await tab.getByRole("button", { name: "Save settings" }).click();
  await tab.getByText("Settings saved.", { exact: false }).waitFor();
  await tab.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await overflow(),
    false,
    "Horizontal overflow on Settings at 390",
  );
  await sections.getByRole("link", { name: "Emails" }).click();
  await tab.getByRole("tab", { name: /Password reset/ }).waitFor();

  await tab.setViewportSize({ width: 390, height: 844 });
  // On failure, name the elements that stick out past the screen.
  const wide = await tab.evaluate(() =>
    [...document.querySelectorAll(".admin *")]
      .filter((e) => e.getBoundingClientRect().right > innerWidth + 1)
      .filter(
        (e) =>
          ![...e.children].some(
            (c) => c.getBoundingClientRect().right > innerWidth + 1,
          ),
      )
      .slice(0, 8)
      .map(
        (e) =>
          `${e.tagName.toLowerCase()}.${e.className} (${Math.round(e.getBoundingClientRect().right)}px)`,
      ),
  );
  assert.equal(
    await overflow(),
    false,
    `Horizontal overflow on Emails at 390: ${wide.join(", ")}`,
  );
  await sections.getByRole("link", { name: "Usage & spend" }).click();
  await tab.locator(".admin-bar").first().waitFor();
  assert.equal(await overflow(), false, "Horizontal overflow on Usage at 390");
  await sections.getByRole("link", { name: "Users" }).click();
  await tab.getByRole("table").waitFor();
  assert.equal(await overflow(), false, "Horizontal overflow on Admin at 390");
  await tab.screenshot({ path: "test-results/admin-users-phone.png" });

  // A member sees neither the nav item nor the StoryNode.
  await tab.route("**/api/profile", async (route) => {
    const response = await route.fetch();
    const profile = await response.json();
    await route.fulfill({
      response,
      json: { ...profile, features: { ...profile.features, admin: false } },
    });
  });
  await tab.setViewportSize({ width: 1024, height: 900 });
  await tab.reload();
  await tab.getByRole("heading", { name: "Admins only" }).waitFor();
  await menu.click();
  assert.equal(
    await tab
      .locator("#account-menu")
      .getByRole("button", { name: "Admin", exact: true })
      .count(),
    0,
  );
  assert.deepEqual(errors, []);
  console.log(
    "Admin PASS: admin menu entry for admins only, overview, user feature toggle, self-lockout locked, hide/show story, activity log, no overflow at 1024/390.",
  );
} finally {
  await browser.close();
}
