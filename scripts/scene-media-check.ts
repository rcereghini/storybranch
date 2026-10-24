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
    await tab.goto("http://127.0.0.1:5173/s/glass-harbor/the-glass-harbor");
    await tab.getByRole("button", { name: "Start a new journey" }).click();
    await startPlayback(tab);
    const element = await tab.locator("video").elementHandle();
    for (const [node, choice] of [
      ["dock", "Speak to the courier"],
      ["courier", "Follow the lanterns to market"],
      ["market", "Run across the rooftops"],
      ["guard", "Surrender the signal"],
      ["failure", ""],
    ]) {
      await tab.waitForFunction(
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
      await tab.screenshot({
        path: `test-results/scene-${node}-${width}.png`,
      });
      await tab.getByRole("button", { name: "Skip to choices" }).click();
      if (choice)
        await tab.getByRole("button", { name: new RegExp(choice) }).click();
    }
    await tab.close();
  }
  console.log(
    "PASS: five distinct scene sources load and play automatically in landscape and portrait on one video element.",
  );
} finally {
  await browser.close();
}
