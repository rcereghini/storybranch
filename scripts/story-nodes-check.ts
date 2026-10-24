import assert from "node:assert/strict";
import { launchBrowser, startPlayback } from "./browser";
const browser = await launchBrowser();
try {
  for (const width of [1440, 390]) {
    const tab = await browser.newPage({ viewport: { width, height: 900 } });
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
    await tab.getByRole("dialog").waitFor({ state: "hidden" });
    await tab.goto("http://127.0.0.1:5173/s/clockwork-door");
    await tab.getByRole("button", { name: "Start a new journey" }).click();
    await tab.getByRole("heading", { name: "A letter at midnight" }).waitFor();
    assert.equal(await tab.locator("video:visible").count(), 0);
    await tab.getByRole("button", { name: /Continue/ }).click();
    await tab.getByRole("heading", { name: "The thirteenth chime" }).waitFor();
    await tab.screenshot({ path: `test-results/text-options-${width}.png` });
    await tab.getByRole("button", { name: /Use the clockwork key/ }).click();
    await startPlayback(tab);
    if (width === 390)
      await tab.getByRole("button", { name: "Next", exact: true }).click();
    await tab.getByRole("heading", { name: "A new beginning" }).waitFor();
    // Endings recommend other stories; which ones depends on the catalogue.
    await tab.getByRole("button", { name: /^Try / }).first().waitFor();
    await tab.getByRole("button", { name: "Discover", exact: true }).click();
    await tab.goto("http://127.0.0.1:5173/s/storm-signal");
    await tab.getByRole("button", { name: "Start a new journey" }).click();
    await startPlayback(tab);
    await tab.getByRole("button", { name: "Skip to choices" }).click();
    await tab.getByRole("button", { name: /Climb the mast/ }).click();
    await tab.getByRole("heading", { name: "Hold fast" }).waitFor();
    assert.equal(await tab.locator("video:visible").count(), 0);
    await tab.screenshot({ path: `test-results/dice-story-node-${width}.png` });
    const beforeRoll = await tab.locator(".reading-story-node").boundingBox();
    await tab.getByRole("button", { name: /Roll d20/ }).click();
    await tab
      .locator(".dice-face")
      .getByText("You rolled", { exact: true })
      .waitFor();
    const result = await tab.locator(".dice-face").innerText();
    const afterRoll = await tab.locator(".reading-story-node").boundingBox();
    assert.equal(
      afterRoll!.height,
      beforeRoll!.height,
      "Roll result must not resize the StoryNode",
    );
    await tab.screenshot({ path: `test-results/dice-result-${width}.png` });
    await tab.reload();
    await tab
      .locator(".dice-face")
      .getByText("You rolled", { exact: true })
      .waitFor();
    assert.equal(await tab.locator(".dice-face").innerText(), result);
    await tab.getByRole("button", { name: /Next/ }).click();
    await tab
      .getByRole("heading", {
        name: /A voice through the storm|Safe until morning/,
      })
      .waitFor();
    assert.equal(
      await tab.locator(".dice-face").count(),
      0,
      "Roll result must disappear after Next",
    );
    assert.equal(await tab.getByText(/Last roll:/).count(), 0);
    // Finish the story so the next width starts it fresh instead of resuming.
    const leave = tab.getByRole("button", { name: /Leave the relay/ });
    if (await leave.count()) await leave.click();
    await tab.getByRole("heading", { name: "Safe until morning" }).waitFor();
    assert(
      await tab.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await tab.close();
  }
  console.log(
    "PASS: all five StoryNode types, mixed stories, key output, server dice result and reload at desktop/mobile widths.",
  );
} finally {
  await browser.close();
}
