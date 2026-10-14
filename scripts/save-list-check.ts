import assert from "node:assert/strict";
import { launchBrowser } from "./browser";
const browser = await launchBrowser();
try {
  const page = await browser.newPage();
  await page.route("**/api/playthroughs", async (route) => {
    if (route.request().method() === "GET")
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "UNAVAILABLE",
            message:
              "The story service is unavailable. Please try again shortly.",
          },
        }),
      });
    else await route.continue();
  });
  await page.goto("http://127.0.0.1:5173");
  await page
    .getByRole("button", { name: /Sign in/ })
    .first()
    .click();
  await page.getByText("LOCAL EMULATOR ACCOUNTS").waitFor();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Sign in ↗" })
    .click();
  await page.getByRole("button", { name: "Retry saved adventures" }).waitFor();
  await page.goto("http://127.0.0.1:5173/s/glass-harbor/the-glass-harbor");
  await page.getByRole("button", { name: "Start a new journey" }).click();
  await page.getByRole("button", { name: "Start story with sound" }).waitFor();
  await page.getByRole("button", { name: /Speak to the courier/ }).click();
  await page
    .getByLabel("A favor, remembered scene video", { exact: true })
    .waitFor();
  if (await page.getByRole("button", { name: "Skip to choices" }).isVisible())
    await page.getByRole("button", { name: "Skip to choices" }).click();
  await page
    .getByRole("heading", { name: "A favor, remembered", exact: true })
    .waitFor();
  assert.equal(await page.getByRole("alert").count(), 0);
  await page.reload();
  await page
    .getByRole("heading", { name: "A favor, remembered", exact: true })
    .waitFor();
  assert.equal(await page.getByRole("alert").count(), 0);
  console.log(
    "PASS: unavailable save list does not block or misreport persisted choices.",
  );
} finally {
  await browser.close();
}
