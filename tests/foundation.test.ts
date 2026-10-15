import { it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { harborMedia, resolveFixtureMedia } from "../fixtures/media";
import { stories } from "../fixtures/stories";
import { mediaSchema } from "../packages/contracts/media";
it("assigns distinct shipped renditions to every fixture node with explicit page types", () => {
  const sources: string[] = [];
  for (const story of stories)
    for (const node of Object.values(story.pages)) {
      expect(node.pageType).toMatch(/^video/);
      const media = resolveFixtureMedia(node.video!)!;
      for (const rendition of [media.landscape, media.portrait!]) {
        sources.push(rendition.src);
        expect(
          readFileSync(`apps/web/public${rendition.src}`).length,
        ).toBeGreaterThan(1000);
        expect(
          readFileSync(`apps/web/public${rendition.poster}`, "utf8"),
        ).toContain("MOCK SCENE");
      }
    }
  expect(new Set(sources).size).toBe(sources.length);
});
it("keeps portable packages free of platform dependencies", () => {
  for (const dir of ["packages/domain", "packages/contracts"])
    for (const file of readdirSync(dir)) {
      const source = readFileSync(`${dir}/${file}`, "utf8");
      expect(source).not.toMatch(/from ['"](?:react|firebase|node:)/);
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
