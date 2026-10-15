import assert from "node:assert/strict";
import { launchBrowser, startPlayback } from "./browser";
const browser = await launchBrowser();
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
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
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page.getByRole("button", { name: /Play The Clockwork Door/ }).click();
    await page.getByRole("heading", { name: "A letter at midnight" }).waitFor();
    assert.equal(await page.locator("video:visible").count(), 0);
    await page.getByRole("button", { name: /Continue/ }).click();
    await page.getByRole("heading", { name: "The thirteenth chime" }).waitFor();
    await page.screenshot({ path: `test-results/text-options-${width}.png` });
    await page.getByRole("button", { name: /Use the clockwork key/ }).click();
    await startPlayback(page);
    if (width === 390)
      await page
        .getByRole("button", { name: "Next page", exact: true })
        .click();
    await page.getByRole("heading", { name: "A new beginning" }).waitFor();
    // Endings recommend other stories; which ones depends on the catalogue.
    await page.getByRole("button", { name: /^Try / }).first().waitFor();
    await page.getByRole("button", { name: "Discover", exact: true }).click();
    await page.getByRole("button", { name: /Play The Storm Signal/ }).click();
    await startPlayback(page);
    await page.getByRole("button", { name: "Skip to choices" }).click();
    await page.getByRole("button", { name: /Climb the mast/ }).click();
    await page.getByRole("heading", { name: "Hold fast" }).waitFor();
    assert.equal(await page.locator("video:visible").count(), 0);
    await page.screenshot({ path: `test-results/dice-page-${width}.png` });
    const beforeRoll = await page.locator(".reading-page").boundingBox();
    await page.getByRole("button", { name: /Roll d20/ }).click();
    await page
      .locator(".dice-face")
      .getByText("You rolled", { exact: true })
      .waitFor();
    const result = await page.locator(".dice-face").innerText();
    const afterRoll = await page.locator(".reading-page").boundingBox();
    assert.equal(
      afterRoll!.height,
      beforeRoll!.height,
      "Roll result must not resize the page",
    );
    await page.screenshot({ path: `test-results/dice-result-${width}.png` });
    await page.reload();
    await page
      .locator(".dice-face")
      .getByText("You rolled", { exact: true })
      .waitFor();
    assert.equal(await page.locator(".dice-face").innerText(), result);
    await page.getByRole("button", { name: /Next page/ }).click();
    await page
      .getByRole("heading", {
        name: /A voice through the storm|Safe until morning/,
      })
      .waitFor();
    assert.equal(
      await page.locator(".dice-face").count(),
      0,
      "Roll result must disappear after Next",
    );
    assert.equal(await page.getByText(/Last roll:/).count(), 0);
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.close();
  }
  console.log(
    "PASS: all five page types, mixed stories, key output, server dice result and reload at desktop/mobile widths.",
  );
} finally {
  await browser.close();
}
