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
  await tab
    .locator("#account-menu")
    .getByRole("button", { name: "Admin", exact: true })
    .click();
  await tab.waitForURL("**/admin");
  await tab.getByText("Published stories", { exact: true }).waitFor();
  assert.equal(await overflow(), false, "Horizontal overflow on Admin at 1024");
  await tab.screenshot({ path: "test-results/admin-overview.png" });

  // Users: turn a member's Copilot off and back on.
  const sections = tab.getByRole("navigation", { name: "Admin sections" });
  await sections.getByRole("button", { name: "Users" }).click();
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

  // Stories: hide and show a story.
  await sections.getByRole("button", { name: "Stories" }).click();
  const story = tab.getByRole("row", { name: /The Glass Harbor/ });
  await story.getByRole("button", { name: "Hide from Discover" }).click();
  await story.getByText("Hidden", { exact: true }).waitFor();
  await story.getByRole("button", { name: "Show in Discover" }).click();
  await story.getByText("Listed", { exact: true }).waitFor();

  // Activity lists those changes, newest first.
  await sections.getByRole("button", { name: "Activity" }).click();
  await tab
    .getByText("showed story glass-harbor in Discover", { exact: false })
    .first()
    .waitFor();
  await tab
    .getByText("turned on Copilot for progressed", { exact: false })
    .first()
    .waitFor();

  // Usage & spend: one bar per day, the period switch, and a readout that
  // answers hover in place.
  await sections.getByRole("button", { name: "Usage & spend" }).click();
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

  // Emails: edit with a live preview, save a draft, publish, see history.
  await sections.getByRole("button", { name: "Emails" }).click();
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

  await tab.setViewportSize({ width: 390, height: 844 });
  assert.equal(await overflow(), false, "Horizontal overflow on Emails at 390");
  await sections.getByRole("button", { name: "Usage & spend" }).click();
  await tab.locator(".admin-bar").first().waitFor();
  assert.equal(await overflow(), false, "Horizontal overflow on Usage at 390");
  await sections.getByRole("button", { name: "Users" }).click();
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
