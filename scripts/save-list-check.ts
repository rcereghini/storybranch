import assert from "node:assert/strict";
import { launchBrowser } from "./browser";
const browser = await launchBrowser();
try {
  const tab = await browser.newPage();
  await tab.route("**/api/playthroughs", async (route) => {
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
  await tab.goto("http://127.0.0.1:5173");
  await tab
    .getByRole("button", { name: /Sign in/ })
    .first()
    .click();
  await tab.getByText("LOCAL EMULATOR ACCOUNTS").waitFor();
  await tab
    .getByRole("dialog")
    .getByRole("button", { name: "Sign in ↗" })
    .click();
  await tab.getByRole("button", { name: "Retry saved adventures" }).waitFor();
  await tab.goto("http://127.0.0.1:5173/s/glass-harbor/the-glass-harbor");
  await tab.getByRole("button", { name: "Start a new journey" }).click();
  await tab.locator("video").waitFor();
  await tab.getByRole("button", { name: /Speak to the courier/ }).click();
  await tab
    .getByLabel("A favor, remembered scene video", { exact: true })
    .waitFor();
  if (await tab.getByRole("button", { name: "Skip to choices" }).isVisible())
    await tab.getByRole("button", { name: "Skip to choices" }).click();
  await tab
    .getByRole("heading", { name: "A favor, remembered", exact: true })
    .waitFor();
  assert.equal(await tab.getByRole("alert").count(), 0);
  await tab.reload();
  await tab
    .getByRole("heading", { name: "A favor, remembered", exact: true })
    .waitFor();
  assert.equal(await tab.getByRole("alert").count(), 0);
  console.log(
    "PASS: unavailable save list does not block or misreport persisted choices.",
  );
} finally {
  await browser.close();
}
