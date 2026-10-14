import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { launchBrowser, startPlayback } from "./browser";
const { key } = JSON.parse(await readFile(".phone-preview.json", "utf8"));
const base = process.env.PHONE_PREVIEW_URL ?? "http://127.0.0.1:4173";
const browser = await launchBrowser();
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const request = context.request;
  const page = await context.newPage();
  if (process.env.TUNNEL_CONFIRM_IP) {
    const response = await page.goto(base);
    if (response?.status() === 511) {
      await page.getByRole("textbox").fill(process.env.TUNNEL_CONFIRM_IP);
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await page
        .getByText("Private phone preview.", { exact: false })
        .waitFor();
    }
  }
  assert.equal((await request.get(base + "/")).status(), 403);
  assert.equal((await request.get(base + "/api/catalogue")).status(), 403);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/preview-access?key=" + key);
  assert.equal(page.url(), base + "/");
  for (const path of [
    "/emulator/v1/projects/demo-storybranch-phone/accounts",
    "/identitytoolkit.googleapis.com/v1/accounts:signUp",
    "/@fs/C:/GameDev/storybranch/README.md",
    "/firebase.phone.json",
    "/.phone-preview.json",
  ]) {
    assert.equal((await request.get(base + path)).status(), 404, path);
  }
  assert.equal((await request.get(base + "/api/playthroughs")).status(), 401);
  const media = base + "/media/harbor-portrait-audio-v1.mp4";
  const range = await request.get(media, { headers: { Range: "bytes=0-127" } });
  assert.equal(range.status(), 206);
  assert.equal((await range.body()).length, 128);
  await page.getByRole("button", { name: "Sign in", exact: false }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Sign in ↗", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.goto(base + "/s/glass-harbor/the-glass-harbor");
  await page.getByRole("button", { name: /Start a new journey/ }).click();
  await startPlayback(page);
  await page.waitForFunction(() => {
    const v = document.querySelector("video")!;
    return v.currentTime > 0.1 && !v.paused && !v.muted;
  });
  await page
    .getByRole("button", { name: "Skip to choices", exact: true })
    .click();
  await page.getByRole("button", { name: /Speak to the courier/ }).click();
  await page
    .getByLabel("A favor, remembered scene video", { exact: true })
    .waitFor();
  await page.waitForFunction(() => {
    const v = document.querySelector("video")!;
    return v.currentTime > 0.1 && !v.paused && !v.muted;
  });
  await page.reload();
  await page
    .getByRole("heading", { name: "A favor, remembered", exact: true })
    .waitFor();
  await page.screenshot({
    path: "test-results/phone-preview.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "Phone preview PASS: access gate, admin/source endpoints denied, same-origin auth, video byte ranges, audible playback, server choice and reload persistence at 390px.",
  );
} finally {
  await browser.close();
}
