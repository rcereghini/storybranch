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
    await page.goto("http://127.0.0.1:5173/s/glass-harbor/the-glass-harbor");
    await page.getByRole("button", { name: "Start a new journey" }).click();
    await startPlayback(page);
    const element = await page.locator("video").elementHandle();
    for (const [node, choice] of [
      ["dock", "Speak to the courier"],
      ["courier", "Follow the lanterns to market"],
      ["market", "Run across the rooftops"],
      ["guard", "Surrender the signal"],
      ["failure", ""],
    ]) {
      await page.waitForFunction(
        ({ node, width }) => {
          const v = document.querySelector("video");
          return (
            v &&
            v.currentSrc.includes(
              `${node}-mock-v1-${width < 701 ? "portrait" : "landscape"}.mp4`,
            ) &&
            !v.paused &&
            v.currentTime > 0.1
          );
        },
        { node, width },
      );
      assert(
        await element!.evaluate((v) => v === document.querySelector("video")),
        "Reuse the authorized video element",
      );
      await page.screenshot({
        path: `test-results/scene-${node}-${width}.png`,
      });
      await page.getByRole("button", { name: "Skip to choices" }).click();
      if (choice)
        await page.getByRole("button", { name: new RegExp(choice) }).click();
    }
    await page.close();
  }
  console.log(
    "PASS: five distinct scene sources load and play automatically in landscape and portrait on one video element.",
  );
} finally {
  await browser.close();
}
