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

  await tab.setViewportSize({ width: 390, height: 844 });
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
