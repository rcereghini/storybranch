import assert from "node:assert/strict";
import { launchBrowser } from "./browser";
const browser = await launchBrowser();
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({
        viewport: { width, height: 1000 },
      }),
      tab = await context.newPage();
    tab.setDefaultTimeout(30000);
    const errors: string[] = [];
    tab.on("pageerror", (e) => errors.push(e.message));
    await tab.goto("http://127.0.0.1:5173/assets");
    await tab.getByRole("button", { name: "Sign in to upload" }).click();
    await tab
      .getByRole("dialog")
      .getByRole("button", { name: "Sign in ↗" })
      .click();
    await tab.getByRole("dialog").waitFor({ state: "hidden" });
    // Without an OpenAI key the generator says so and never simulates a result.
    await tab
      .getByRole("button", { name: "Generate image", exact: true })
      .click();
    await tab
      .getByLabel("Prompt", { exact: true })
      .fill("A traveler approaches a lantern-lit gate in the rain");
    await tab.locator(".imagegen-off").waitFor();
    assert.equal(
      await tab
        .getByRole("button", { name: "Generate image", exact: true })
        .isDisabled(),
      true,
      "No configured provider must not simulate generation",
    );
    assert.equal(
      await tab.getByRole("button", { name: /^Generate video/ }).count(),
      0,
      "Video generation is turned off",
    );
    await tab.screenshot({
      path: `test-results/image-generator-${width}.png`,
    });
    assert(
      await tab.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await tab.getByRole("button", { name: "← Assets" }).click();
    const upload = tab.waitForResponse(
      (r) => r.url().includes("/complete") && r.request().method() === "POST",
    );
    await tab
      .getByLabel("Upload a clip", { exact: true })
      .setInputFiles("apps/web/public/media/harbor.webm");
    const asset = (await (await upload).json()).asset;
    await tab.goto(`http://127.0.0.1:5173/assets/edit/${asset.id}`);
    const editName = `Workshop edit ${width} ${Date.now()}`;
    await tab.getByLabel("Asset name").fill(editName);
    await tab.waitForFunction(
      () => document.querySelector("video")?.readyState! >= 2,
    );
    await tab.getByLabel("Clip start (seconds)").fill("0.5");
    await tab.getByLabel("Clip end (seconds)").fill("1.5");
    await tab.getByLabel("Crop", { exact: true }).selectOption("9:16");
    await tab.getByLabel("Remove audio").check();
    await tab.screenshot({ path: `test-results/video-editor-${width}.png` });
    assert(
      await tab.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    const exported = tab.waitForResponse(
      (r) => r.url().includes("/complete") && r.request().method() === "POST",
    );
    await tab.getByRole("button", { name: "Save edited video" }).click();
    const edited = (await (await exported).json()).asset;
    assert.notEqual(edited.id, asset.id);
    assert.equal(edited.durationSeconds, 1);
    await tab
      .getByText("Saved a new video to your assets.", { exact: true })
      .waitFor();
    await tab.getByRole("button", { name: "Back to assets" }).click();
    await tab
      .getByRole("heading", {
        name: `${editName}.webm`,
        exact: true,
      })
      .waitFor();
    const dimensions = await tab.evaluate(async (src: string) => {
      const v = document.createElement("video");
      v.src = src;
      await new Promise<void>((resolve, reject) => {
        v.onloadedmetadata = () => resolve();
        v.onerror = () => reject(new Error("Export not playable"));
      });
      return { w: v.videoWidth, h: v.videoHeight };
    }, edited.media.landscape.src);
    assert(Math.abs(dimensions.w / dimensions.h - 9 / 16) < 0.01);
    if (width === 1440) {
      // Upload a photo to use as a reference image.
      const photo = `reference-${Date.now()}.png`;
      await tab.getByLabel("Upload a photo", { exact: true }).setInputFiles({
        name: photo,
        mimeType: "image/png",
        buffer: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aYx8AAAAASUVORK5CYII=",
          "base64",
        ),
      });
      await tab.getByText(`${photo} is ready`, { exact: false }).waitFor();
      const jobs: Record<string, any> = {};
      const submitted: any[] = [];
      await tab.route("**/api/generation**", async (route) => {
        const request = route.request(),
          url = new URL(request.url());
        if (request.method() === "GET")
          return route.fulfill({
            json: {
              enabled: true,
              reason: null,
              remaining: 100,
              jobs: Object.values(jobs),
            },
          });
        if (url.pathname === "/api/generation") {
          const command = request.postDataJSON();
          submitted.push(command);
          const id = `mock-${submitted.length}`;
          jobs[id] = {
            id,
            kind: command.kind,
            prompt: command.prompt,
            quality: command.quality,
            aspect: command.aspect,
            status: "queued",
            createdAt: Date.now(),
          };
          return route.fulfill({ json: jobs[id] });
        }
        const id = url.pathname.split("/").at(-1)!;
        jobs[id] = {
          ...jobs[id],
          status: "ready",
          asset: {
            ...asset,
            id: `test-${id}`,
            fileName: `generated-${id}.jpg`,
            media: undefined,
            url: "/og/default.png",
            contentType: "image/jpeg",
            durationSeconds: 0,
          },
        };
        return route.fulfill({ json: jobs[id] });
      });
      await tab
        .getByRole("button", { name: "Generate image", exact: true })
        .click();
      const prompt = tab.getByLabel("Prompt", { exact: true });
      await prompt.fill("A courier waits under a broken lighthouse");
      // Quick draft hides references; High quality offers them.
      assert.equal(
        await tab.locator("legend", { hasText: "Reference images" }).count(),
        0,
      );
      await tab.getByRole("button", { name: "High quality" }).click();
      await tab.getByRole("button", { name: "Portrait" }).click();
      await tab
        .getByRole("button", { name: `Use ${photo} as a reference` })
        .click();
      await tab
        .getByRole("button", { name: "Generate image", exact: true })
        .click();
      await tab.getByText("Saved to your assets.", { exact: true }).waitFor();
      assert.equal(submitted.length, 1);
      assert.equal(submitted[0].kind, "image");
      assert.equal(submitted[0].quality, "high");
      assert.equal(submitted[0].aspect, "9:16");
      assert.equal(submitted[0].referenceIds.length, 1);
      await tab
        .getByAltText("A courier waits under a broken lighthouse")
        .waitFor();
      // A quick draft never sends references, even if some were picked.
      await tab.getByRole("button", { name: "Quick draft" }).click();
      await tab
        .getByRole("button", { name: "Generate image", exact: true })
        .click();
      await tab.waitForFunction(() =>
        document
          .querySelector(".imagegen-status")
          ?.textContent?.includes("Saved"),
      );
      await tab.waitForTimeout(300);
      assert.equal(submitted.length, 2);
      assert.equal(submitted[1].quality, "draft");
      assert.equal(submitted[1].referenceIds, undefined);
      await tab.screenshot({ path: "test-results/image-generator-done.png" });
      await tab.unroute("**/api/generation**");
      await tab.getByRole("button", { name: "← Assets" }).click();
      await tab
        .getByRole("heading", { name: "generated-mock-1.jpg", exact: true })
        .waitFor();
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log(
    "PASS: image generation (provider gating, tiers, shape, references), uploads and real trim/crop export at desktop/mobile widths.",
  );
} finally {
  await browser.close();
}
