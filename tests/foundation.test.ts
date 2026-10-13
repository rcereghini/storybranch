import { it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { harborMedia } from "../fixtures/media";
import { mediaSchema } from "../packages/contracts/media";
it("keeps portable packages free of platform dependencies", () => {
  for (const dir of ["packages/domain", "packages/contracts"])
    for (const file of readdirSync(dir)) {
      const source = readFileSync(`${dir}/${file}`, "utf8");
      expect(source).not.toMatch(/from ['"](?:react|firebase|node:|@netlify)/);
      expect(source).not.toMatch(/\b(?:window|document|localStorage|fetch)\b/);
    }
});
it("keeps presentation renditions independent and rejects nonlocal fixture media", () => {
  expect(harborMedia.landscape.src).toBe(
    "/media/harbor-landscape-audio-v1.mp4",
  );
  expect(harborMedia.portrait?.src).not.toBe(harborMedia.landscape.src);
  expect(harborMedia.socialClip?.src).not.toBe(harborMedia.portrait?.src);
  expect(
    mediaSchema.safeParse({
      ...harborMedia,
      portrait: {
        ...harborMedia.portrait,
        src: "https://untrusted.example/clip.mp4",
      },
    }).success,
  ).toBe(false);
  for (const asset of [
    harborMedia.landscape,
    harborMedia.portrait!,
    harborMedia.socialClip!,
  ])
    expect(readFileSync(`apps/web/public${asset.src}`).length).toBeGreaterThan(
      1000,
    );
});
