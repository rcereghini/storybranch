import assert from "node:assert/strict";
import { launchBrowser } from "./browser";
const browser = await launchBrowser();
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({
        viewport: { width, height: 1000 },
      }),
      page = await context.newPage();
    page.setDefaultTimeout(30000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://127.0.0.1:5173/assets");
    await page.getByRole("button", { name: "Sign in to upload" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Sign in ↗" })
      .click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    // Without a fal key the generator says so and never simulates a result.
    await page
      .getByRole("button", { name: "Generate image", exact: true })
      .click();
    await page
      .getByLabel("Prompt", { exact: true })
      .fill("A traveler approaches a lantern-lit gate in the rain");
    await page.locator(".imagegen-off").waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Generate image", exact: true })
        .isDisabled(),
      true,
      "No configured provider must not simulate generation",
    );
    assert.equal(
      await page.getByRole("button", { name: /^Generate video/ }).count(),
      0,
      "Video generation is turned off",
    );
    await page.screenshot({
      path: `test-results/image-generator-${width}.png`,
    });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.getByRole("button", { name: "← Assets" }).click();
    const upload = page.waitForResponse(
      (r) => r.url().includes("/complete") && r.request().method() === "POST",
    );
    await page
      .getByLabel("Upload a clip", { exact: true })
      .setInputFiles("apps/web/public/media/harbor.webm");
    const asset = (await (await upload).json()).asset;
    await page.goto(`http://127.0.0.1:5173/assets/edit/${asset.id}`);
    const editName = `Workshop edit ${width} ${Date.now()}`;
    await page.getByLabel("Asset name").fill(editName);
    await page.waitForFunction(
      () => document.querySelector("video")?.readyState! >= 2,
    );
    await page.getByLabel("Clip start (seconds)").fill("0.5");
    await page.getByLabel("Clip end (seconds)").fill("1.5");
    await page.getByLabel("Crop", { exact: true }).selectOption("9:16");
    await page.getByLabel("Remove audio").check();
    await page.screenshot({ path: `test-results/video-editor-${width}.png` });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    const exported = page.waitForResponse(
      (r) => r.url().includes("/complete") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Save edited video" }).click();
    const edited = (await (await exported).json()).asset;
    assert.notEqual(edited.id, asset.id);
    assert.equal(edited.durationSeconds, 1);
    await page
      .getByText("Saved a new video to your assets.", { exact: true })
      .waitFor();
    await page.getByRole("button", { name: "Back to assets" }).click();
    await page
      .getByRole("heading", {
        name: `${editName}.webm`,
        exact: true,
      })
      .waitFor();
    const dimensions = await page.evaluate(async (src: string) => {
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
      await page.getByLabel("Upload a photo", { exact: true }).setInputFiles({
        name: photo,
        mimeType: "image/png",
        buffer: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aYx8AAAAASUVORK5CYII=",
          "base64",
        ),
      });
      await page.getByText(`${photo} is ready`, { exact: false }).waitFor();
      const jobs: Record<string, any> = {};
      const submitted: any[] = [];
      await page.route("**/api/generation**", async (route) => {
        const request = route.request(),
          url = new URL(request.url());
        if (request.method() === "GET")
          return route.fulfill({
            json: { enabled: true, reason: null, jobs: Object.values(jobs) },
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
      await page
        .getByRole("button", { name: "Generate image", exact: true })
        .click();
      const prompt = page.getByLabel("Prompt", { exact: true });
      await prompt.fill("A courier waits under a broken lighthouse");
      // Quick draft hides references; High quality offers them.
      assert.equal(
        await page.locator("legend", { hasText: "Reference images" }).count(),
        0,
      );
      await page.getByRole("button", { name: "High quality" }).click();
      await page.getByRole("button", { name: "Portrait" }).click();
      await page
        .getByRole("button", { name: `Use ${photo} as a reference` })
        .click();
      await page
        .getByRole("button", { name: "Generate image", exact: true })
        .click();
      await page.getByText("Saved to your assets.", { exact: true }).waitFor();
      assert.equal(submitted.length, 1);
      assert.equal(submitted[0].kind, "image");
      assert.equal(submitted[0].quality, "high");
      assert.equal(submitted[0].aspect, "9:16");
      assert.equal(submitted[0].referenceIds.length, 1);
      await page
        .getByAltText("A courier waits under a broken lighthouse")
        .waitFor();
      // A quick draft never sends references, even if some were picked.
      await page.getByRole("button", { name: "Quick draft" }).click();
      await page
        .getByRole("button", { name: "Generate image", exact: true })
        .click();
      await page.waitForFunction(() =>
        document.querySelector(".imagegen-status")?.textContent?.includes("Saved"),
      );
      await page.waitForTimeout(300);
      assert.equal(submitted.length, 2);
      assert.equal(submitted[1].quality, "draft");
      assert.equal(submitted[1].referenceIds, undefined);
      await page.screenshot({ path: "test-results/image-generator-done.png" });
      await page.unroute("**/api/generation**");
      await page.getByRole("button", { name: "← Assets" }).click();
      await page
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
