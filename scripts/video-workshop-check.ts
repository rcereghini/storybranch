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
    await page
      .getByRole("button", { name: "Generate video", exact: true })
      .click();
    await page
      .getByLabel("Scene prompt")
      .fill("A traveler approaches a lantern-lit gate in the rain");
    await page.getByRole("button", { name: "Build keyframes →" }).click();
    const photo = `workshop-${width}-${Date.now()}.png`;
    await page.getByLabel("Upload a photo", { exact: true }).setInputFiles({
      name: photo,
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aYx8AAAAASUVORK5CYII=",
        "base64",
      ),
    });
    await page.getByText(`Uploaded ${photo}.`, { exact: false }).waitFor();
    await page.getByAltText("Keyframe 1", { exact: true }).waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Generate frame", exact: true })
        .isDisabled(),
      true,
      "No configured provider must not simulate generation",
    );
    await page.screenshot({
      path: `test-results/video-generator-${width}.png`,
    });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.reload();
    assert.match(
      await page.getByLabel("Scene prompt").inputValue(),
      /traveler/,
    );
    await page.getByRole("button", { name: "Back to assets" }).click();
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
      const jobs: Record<string, any> = {};
      const submitted: any[] = [];
      let imageUrl = "";
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
            status: "queued",
            createdAt: Date.now(),
          };
          return route.fulfill({ json: jobs[id] });
        }
        const id = url.pathname.split("/").at(-1)!;
        jobs[id] = {
          ...jobs[id],
          status: "ready",
          asset:
            jobs[id].kind === "video"
              ? { ...asset, id: `test-${id}`, durationSeconds: 1 }
              : {
                  ...asset,
                  id: `test-${id}`,
                  media: undefined,
                  url: imageUrl,
                  contentType: "image/png",
                  durationSeconds: 0,
                },
        };
        return route.fulfill({ json: jobs[id] });
      });
      await page
        .getByRole("button", { name: "Generate video", exact: true })
        .click();
      await page.getByRole("button", { name: "Build keyframes →" }).click();
      // Select three existing images, then reorder one before submitting.
      for (const button of await page
        .locator('.frame-assets button[aria-pressed="true"]')
        .all())
        await button.click();
      for (let i = 0; i < 3; i++)
        await page.locator(".frame-assets button").nth(i).click();
      const firstSrc = await page
        .getByAltText("Keyframe 1", { exact: true })
        .getAttribute("src");
      await page.getByRole("button", { name: "Move frame 2 earlier" }).click();
      imageUrl = firstSrc!;
      assert.notEqual(
        await page
          .getByAltText("Keyframe 1", { exact: true })
          .getAttribute("src"),
        firstSrc,
      );
      await page
        .getByRole("button", { name: "Generate 3 frame suggestions" })
        .click();
      await page
        .getByText(
          "Frame suggestions saved. Choose the ones you want in your timeline.",
          { exact: true },
        )
        .waitFor();
      assert.equal(
        await page
          .getByAltText("Suggested next frame", { exact: true })
          .count(),
        3,
      );
      await page
        .getByRole("button", { name: "Use suggested frame", exact: true })
        .first()
        .click();
      await page.getByRole("button", { name: "Review video →" }).click();
      const joined = page.waitForResponse(
        (r) => r.url().includes("/complete") && r.request().method() === "POST",
      );
      await page
        .getByRole("button", { name: "Generate video", exact: true })
        .click();
      const sequence = (await (await joined).json()).asset;
      const shots = submitted.filter((command) => command.kind === "video");
      assert.equal(shots.length, 3);
      assert.equal(shots[0].lastId, shots[1].firstId);
      assert.equal(shots[1].lastId, shots[2].firstId);
      assert.equal(sequence.durationSeconds, 3);
      await page
        .getByText(
          "Complete video saved to your asset library. Individual shots are saved too.",
          { exact: true },
        )
        .waitFor();
      await page.unroute("**/api/generation**");
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log(
    "PASS: generation draft/upload/provider gating and real trim/crop export into assets at desktop/mobile widths.",
  );
} finally {
  await browser.close();
}
