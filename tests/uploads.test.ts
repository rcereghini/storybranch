import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { pageSchema } from "../packages/contracts/index";
import {
  assetIdOf,
  assetRef,
  mediaSchema,
  uploadCommandSchema,
} from "../packages/contracts/media";
import { downloadUrl, sniffVideo } from "../services/api/video-check";

const token = "0f8fad5b-d9cb-469f-a165-70867728950e";

it("recognizes MP4 and WebM by their bytes, not their names", () => {
  const mp4 = readFileSync(
    "apps/web/public/media/harbor-landscape-audio-v1.mp4",
  );
  expect(sniffVideo(new Uint8Array(mp4.subarray(0, 64)))).toBe("video/mp4");
  expect(sniffVideo(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x01]))).toBe(
    "video/webm",
  );
  expect(sniffVideo(new TextEncoder().encode("<html>not a video</html>"))).toBe(
    null,
  );
  expect(sniffVideo(new Uint8Array([]))).toBe(null);
});

it("builds download URLs the media contract accepts, live and local", () => {
  const live = downloadUrl(
    undefined,
    "storybranch-f77a3.firebasestorage.app",
    "users/uid-1/clips/clip-1",
    token,
  );
  expect(live).toBe(
    `https://firebasestorage.googleapis.com/v0/b/storybranch-f77a3.firebasestorage.app/o/users%2Fuid-1%2Fclips%2Fclip-1?alt=media&token=${token}`,
  );
  const local = downloadUrl(
    "127.0.0.1:9299",
    "demo-storybranch.appspot.com",
    "users/u/clips/c",
    token,
  );
  for (const src of [live, local])
    expect(
      mediaSchema.safeParse({ landscape: { src, type: "video/mp4" } }).success,
    ).toBe(true);
  for (const src of [
    `https://evil.example/v0/b/x/o/y?alt=media&token=${token}`,
    `http://10.0.0.1:9299/v0/b/x/o/y?alt=media&token=${token}`,
    "javascript:alert(1)",
  ])
    expect(
      mediaSchema.safeParse({ landscape: { src, type: "video/mp4" } }).success,
    ).toBe(false);
});

it("lets pages reference uploaded clips by asset ID only", () => {
  const page = {
    id: "opening",
    title: "Opening",
    transcript: "",
    kind: "scene",
    pageType: "video",
    entryEffects: [],
    choices: [],
  };
  const ref = assetRef("0f8fad5b-d9cb-469f-a165-70867728950e");
  expect(pageSchema.safeParse({ ...page, video: ref }).success).toBe(true);
  expect(pageSchema.safeParse({ ...page, video: "/media/a.mp4" }).success).toBe(
    true,
  );
  for (const video of [
    "asset:../x",
    "asset:short",
    "https://example.com/clip.mp4",
  ])
    expect(pageSchema.safeParse({ ...page, video }).success).toBe(false);
  expect(assetIdOf(ref)).toBe("0f8fad5b-d9cb-469f-a165-70867728950e");
  expect(assetIdOf("/media/a.mp4")).toBe(null);
});

it("bounds upload requests", () => {
  const valid = {
    idempotencyKey: "key-1",
    fileName: "harbor.mp4",
    contentType: "video/mp4",
    bytes: 1000,
    durationSeconds: 8,
  };
  expect(uploadCommandSchema.safeParse(valid).success).toBe(true);
  for (const change of [
    { contentType: "image/png" },
    { bytes: 101 * 1024 * 1024 },
    { bytes: 0 },
    { durationSeconds: 61 },
    { fileName: "../secret.mp4" },
    { fileName: "" },
    { ownerUid: "someone-else" },
  ])
    expect(uploadCommandSchema.safeParse({ ...valid, ...change }).success).toBe(
      false,
    );
});
