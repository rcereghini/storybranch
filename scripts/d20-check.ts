import assert from "node:assert/strict";
import { launchBrowser, startPlayback } from "./browser";

const browser = await launchBrowser();
try {
  for (const [width, theme, mode] of [
    [1440, "light", "animated"],
    [390, "dark", "animated"],
    [390, "light", "reduced"],
    [1440, "dark", "fallback"],
  ] as const) {
    const tab = await browser.newPage({
      viewport: { width, height: 900 },
      reducedMotion: mode === "reduced" ? "reduce" : "no-preference",
    });
    const errors: string[] = [];
    tab.on("pageerror", (error) => errors.push(error.message));
    await tab.addInitScript(
      ({ theme, mode }) => {
        localStorage.setItem("storybranch-theme", theme);
        if (mode === "fallback") {
          const original = HTMLCanvasElement.prototype.getContext;
          HTMLCanvasElement.prototype.getContext = function (
            this: HTMLCanvasElement,
            kind: string,
            ...args: any[]
          ) {
            return kind.startsWith("webgl")
              ? null
              : original.call(this, kind as any, ...args);
          } as typeof original;
        }
      },
      { theme, mode },
    );
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
    await tab.goto("http://127.0.0.1:5173/s/storm-signal");
    await tab.getByRole("button", { name: "Start a new journey" }).click();
    await startPlayback(tab);
    await tab.getByRole("button", { name: "Skip to choices" }).click();
    await tab.getByRole("button", { name: /Climb the mast/ }).click();
    await tab.getByRole("heading", { name: "Hold fast" }).waitFor();
    if (mode !== "fallback")
      await tab.locator(".dice-model canvas:visible").waitFor();
    const before = await tab.locator(".reading-story-node").boundingBox();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let commands = 0;
    const retryCase = width === 1440 && mode === "animated";
    const bodies: string[] = [];
    await tab.route("**/choices", async (route) => {
      commands++;
      bodies.push(route.request().postData()!);
      await gate;
      if (retryCase && commands === 1) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            error: { code: "UNAVAILABLE", message: "Temporary test failure" },
          }),
        });
        return;
      }
      await route.continue();
    });
    await tab.getByRole("button", { name: /Roll d20/ }).focus();
    await tab.keyboard.press("Enter");
    await tab.locator('[data-dice-state="rolling"]').waitFor();
    assert.equal(await tab.getByText("You rolled", { exact: true }).count(), 0);
    assert(await tab.getByRole("button", { name: /Roll d20/ }).isDisabled());
    if (mode !== "fallback") {
      const first = await tab
        .locator(".dice-model")
        .screenshot({ animations: "disabled" });
      await tab.waitForTimeout(180);
      const second = await tab
        .locator(".dice-model")
        .screenshot({ animations: "disabled" });
      assert.equal(
        first.equals(second),
        mode === "reduced",
        "Only ordinary motion should tumble while waiting",
      );
    }
    release();
    if (retryCase) {
      await tab.getByRole("button", { name: "Retry same request" }).waitFor();
      await tab.locator('[data-dice-state="ready"]').waitFor();
      assert.equal(
        await tab.getByText("You rolled", { exact: true }).count(),
        0,
      );
      await tab.getByRole("button", { name: "Retry same request" }).click();
    }
    await tab.locator('[data-dice-state="result"]').waitFor();
    assert.equal(commands, retryCase ? 2 : 1);
    if (retryCase)
      assert.equal(bodies[0], bodies[1], "Retry must retain the same command");
    await tab.unroute("**/choices");
    await tab.waitForTimeout(750);
    assert.equal(
      (await tab.locator(".reading-story-node").boundingBox())!.height,
      before!.height,
    );
    const result = await tab.locator(".dice-face").innerText();
    await tab.screenshot({
      path: `test-results/d20-${theme}-${width}-${mode}.png`,
    });
    assert(
      await tab.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    if (mode === "animated") {
      await tab
        .locator(".dice-model canvas")
        .evaluate((canvas: HTMLCanvasElement) =>
          canvas
            .getContext("webgl2")!
            .getExtension("WEBGL_lose_context")!
            .loseContext(),
        );
      await tab.locator(".dice-model canvas").waitFor({ state: "detached" });
      assert.equal(await tab.locator(".dice-face").innerText(), result);
    }
    await tab.reload();
    await tab.getByText("You rolled", { exact: true }).waitFor();
    assert.equal(await tab.locator(".dice-face").innerText(), result);
    if (mode !== "fallback") {
      await tab.locator(".dice-model canvas:visible").waitFor();
      const first = await tab
        .locator(".dice-model")
        .screenshot({ animations: "disabled" });
      await tab.waitForTimeout(180);
      assert(
        first.equals(
          await tab
            .locator(".dice-model")
            .screenshot({ animations: "disabled" }),
        ),
        "Reload must restore a static saved face",
      );
    }
    await tab.getByRole("button", { name: /Next/ }).click();
    await tab
      .getByRole("heading", {
        name: /A voice through the storm|Safe until morning/,
      })
      .waitFor();
    assert.equal(await tab.locator(".dice-face").count(), 0);
    const leave = tab.getByRole("button", { name: /Leave the relay/ });
    if (await leave.count()) await leave.click();
    await tab.getByRole("heading", { name: "Safe until morning" }).waitFor();
    assert.deepEqual(errors, []);
    await tab.close();
  }
  console.log(
    "PASS: d20 animation, keyboard Roll, server result, stable layout, reload/Next, reduced motion, WebGL failure/context loss; both themes at 390/1440.",
  );
} finally {
  await browser.close();
}
