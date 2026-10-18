// Browser check for the admin dashboard against the seeded emulator, where
// "player" is the local admin and "progressed" a member.
import assert from "node:assert/strict";
import { launchBrowser } from "./browser";

const browser = await launchBrowser();
try {
  const context = await browser.newContext({
    viewport: { width: 1024, height: 900 },
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const overflow = () =>
    page.evaluate(() => document.documentElement.scrollWidth > innerWidth);

  await page.goto("http://127.0.0.1:5173/discover");
  await page.getByRole("button", { name: "Sign in" }).first().click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Sign in ↗", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  // Admin is in the account menu, only for admins.
  const menu = page.getByRole("button", { name: "Account menu" });
  await menu.click();
  await page.locator("#account-menu").getByRole("button", { name: "Admin", exact: true }).click();
  await page.waitForURL("**/admin");
  await page.getByText("Published stories", { exact: true }).waitFor();
  assert.equal(await overflow(), false, "Horizontal overflow on Admin at 1024");
  await page.screenshot({ path: "test-results/admin-overview.png" });

  // Users: turn a member's Copilot off and back on.
  const sections = page.getByRole("navigation", { name: "Admin sections" });
  await sections.getByRole("button", { name: "Users" }).click();
  const row = page.getByRole("row", { name: /progressed@storybranch\.test/ });
  const copilot = row.getByRole("checkbox", { name: "Copilot" });
  await copilot.waitFor();
  assert.equal(await copilot.isChecked(), true);
  await copilot.click();
  await page.waitForFunction(
    () =>
      ![...document.querySelectorAll("tr")]
        .find((r) => r.textContent?.includes("progressed@storybranch.test"))
        ?.querySelector<HTMLInputElement>("label:nth-child(3) input")?.checked,
  );
  await copilot.click();
  await page.waitForFunction(
    () =>
      ![...document.querySelectorAll("tr")]
        .find((r) => r.textContent?.includes("progressed@storybranch.test"))
        ?.querySelector<HTMLInputElement>("input:disabled:not([title])"),
  );
  assert.equal(await copilot.isChecked(), true);
  await page.screenshot({ path: "test-results/admin-users.png" });
  // The admin's own admin flag and account controls are locked.
  const self = page.getByRole("row", { name: /player@storybranch\.test/ });
  assert.equal(await self.getByRole("checkbox", { name: "Admin" }).isDisabled(), true);
  assert.equal(await self.getByRole("button", { name: "Disable" }).count(), 0);

  // Stories: hide and show a story.
  await sections.getByRole("button", { name: "Stories" }).click();
  const story = page.getByRole("row", { name: /The Glass Harbor/ });
  await story.getByRole("button", { name: "Hide from Discover" }).click();
  await story.getByText("Hidden", { exact: true }).waitFor();
  await story.getByRole("button", { name: "Show in Discover" }).click();
  await story.getByText("Listed", { exact: true }).waitFor();

  // Activity lists those changes, newest first.
  await sections.getByRole("button", { name: "Activity" }).click();
  await page
    .getByText("showed story glass-harbor in Discover", { exact: false })
    .first()
    .waitFor();
  await page
    .getByText("turned on Copilot for progressed", { exact: false })
    .first()
    .waitFor();

  await page.setViewportSize({ width: 390, height: 844 });
  await sections.getByRole("button", { name: "Users" }).click();
  await page.getByRole("table").waitFor();
  assert.equal(await overflow(), false, "Horizontal overflow on Admin at 390");
  await page.screenshot({ path: "test-results/admin-users-phone.png" });

  // A member sees neither the nav item nor the page.
  await page.route("**/api/profile", async (route) => {
    const response = await route.fetch();
    const profile = await response.json();
    await route.fulfill({
      response,
      json: { ...profile, features: { ...profile.features, admin: false } },
    });
  });
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.reload();
  await page.getByRole("heading", { name: "Admins only" }).waitFor();
  await menu.click();
  assert.equal(
    await page.locator("#account-menu").getByRole("button", { name: "Admin", exact: true }).count(),
    0,
  );
  assert.deepEqual(errors, []);
  console.log(
    "Admin PASS: admin menu entry for admins only, overview, user feature toggle, self-lockout locked, hide/show story, activity log, no overflow at 1024/390.",
  );
} finally {
  await browser.close();
}
