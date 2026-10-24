// Browser check for account emails against the emulator: the forgot-password
// form, and the branded page a reset link opens. Locally emails are logged,
// not sent, so the reset code comes from the Auth emulator.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { launchBrowser } from "./browser";

const authApi = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1";
const post = async (path: string, body: object) => {
  const r = await fetch(`${authApi}/${path}?key=local-demo-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { ok: r.ok, data: await r.json() };
};
const email = `reset-${randomUUID()}@storybranch.test`;
await post("accounts:signUp", { email, password: "HarborDemo123!" });

const browser = await launchBrowser();
try {
  const context = await browser.newContext({
    viewport: { width: 1024, height: 900 },
  });
  const tab = await context.newPage();
  const errors: string[] = [];
  tab.on("pageerror", (e) => errors.push(e.message));

  // Forgot password, from the sign-in dialog.
  await tab.goto("http://127.0.0.1:5173/discover");
  await tab.getByRole("button", { name: "Sign in" }).first().click();
  const dialog = tab.getByRole("dialog");
  await dialog.getByRole("button", { name: "Forgot password?" }).click();
  await dialog.getByRole("heading", { name: "Reset your password." }).waitFor();
  await dialog.getByLabel("Email").fill(email);
  await dialog.getByRole("button", { name: "Send reset link ↗" }).click();
  await dialog.getByText(/a reset link is on\s+its way/).waitFor();
  await tab.screenshot({ path: "test-results/forgot-password.png" });
  await dialog.getByRole("button", { name: "Back to sign in" }).click();
  await dialog
    .getByRole("button", { name: "Sign in ↗", exact: true })
    .waitFor();

  // The link's page: choose a new password with a fresh code.
  await post("accounts:sendOobCode", { requestType: "PASSWORD_RESET", email });
  const codes = (await (
    await fetch(
      "http://127.0.0.1:9099/emulator/v1/projects/demo-storybranch/oobCodes",
    )
  ).json()) as { oobCodes: Array<{ email: string; oobCode: string }> };
  const code = codes.oobCodes.filter((c) => c.email === email).at(-1)!.oobCode;
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(
    `http://127.0.0.1:5173/account/action?mode=resetPassword&oobCode=${code}`,
  );
  await page.getByRole("heading", { name: "Choose a new password." }).waitFor();
  assert.equal(
    new URL(page.url()).search,
    "",
    "The one-time code stayed in the address bar",
  );
  await page.getByText(`For ${email}`).waitFor();
  await page.getByLabel("New password", { exact: true }).fill("Lantern42!x");
  await page.getByLabel("Confirm new password").fill("Lantern42!y");
  await page.getByRole("button", { name: "Save new password ↗" }).click();
  await page.getByText("Your passwords do not match.").waitFor();
  await page.getByLabel("Confirm new password").fill("Lantern42!x");
  await page.getByRole("button", { name: "Save new password ↗" }).click();
  await page.getByRole("heading", { name: "Password changed." }).waitFor();
  await page.screenshot({ path: "test-results/account-action.png" });
  assert.equal(
    (
      await post("accounts:signInWithPassword", {
        email,
        password: "Lantern42!x",
        returnSecureToken: true,
      })
    ).ok,
    true,
    "The new password does not sign in",
  );

  // A used or broken link explains itself.
  await page.goto(
    `http://127.0.0.1:5173/account/action?mode=resetPassword&oobCode=${code}`,
  );
  await page.getByRole("heading", { name: "This link didn't work." }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    "Horizontal overflow on the account page at 390",
  );
  assert.deepEqual(errors, []);
  console.log("Email checks passed.");
} finally {
  await browser.close();
}
