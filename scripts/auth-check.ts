import assert from "node:assert/strict";
import { launchBrowser } from "./browser";

const browser = await launchBrowser();
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto("http://127.0.0.1:5173");
  await page
    .getByRole("button", { name: "Sign in", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  // Never create test accounts in production.
  await dialog.getByText("LOCAL EMULATOR ACCOUNTS").waitFor();
  await dialog
    .getByRole("button", { name: "Create an account", exact: true })
    .click();
  const email = `signup-${Date.now()}@storybranch.test`;
  await dialog.getByLabel("Email", { exact: true }).fill(email);
  await dialog.getByLabel("Password", { exact: true }).fill("SignupCheck123!");
  await dialog.getByLabel("Confirm password").fill("Mismatch123!");
  await dialog.getByRole("button", { name: "Create account ↗" }).click();
  await dialog.getByText("Your passwords do not match.").waitFor();
  await dialog.getByLabel("Confirm password").fill("SignupCheck123!");
  await page.screenshot({ path: "test-results/signup-mobile.png" });
  await dialog.getByRole("button", { name: "Create account ↗" }).click();
  await dialog.waitFor({ state: "hidden" });
  await page.reload();
  await page.getByRole("button", { name: "Account menu" }).waitFor();
  await page.goto("http://127.0.0.1:5173/s/glass-harbor/the-glass-harbor");
  await page.getByRole("button", { name: "Start a new journey" }).click();
  await page.locator("video").waitFor();
  const saveUrl = page.url();
  // Sign out lives in the account menu.
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await page
    .getByRole("button", { name: "Sign in", exact: true })
    .first()
    .click();
  await dialog.getByLabel("Email", { exact: true }).fill(email);
  await dialog.getByLabel("Password", { exact: true }).fill("SignupCheck123!");
  await dialog.getByRole("button", { name: "Sign in ↗" }).click();
  await dialog.waitFor({ state: "hidden" });
  await page.goto(saveUrl);
  await page.locator("video").waitFor();
  assert.equal(page.url(), saveUrl);
  // Sign out lives in the account menu.
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await page
    .getByRole("button", { name: "Sign in", exact: true })
    .first()
    .click();
  const popupPromise = page.waitForEvent("popup");
  await dialog.getByRole("button", { name: "Continue with Google" }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  console.log(
    "Google emulator popup:",
    await popup.locator("body").innerText(),
  );
  await popup.close();
  await dialog
    .getByText("Google sign-in was cancelled. You can try again.")
    .waitFor();
  console.log(
    "PASS: registration, password mismatch, session persistence, new-player save, sign-out/sign-in/resume, Google popup and cancellation.",
  );
} finally {
  await browser.close();
}
