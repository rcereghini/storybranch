import { it, expect } from "vitest";
import {
  contentOf,
  pageContentSchema,
  placePage,
  type LibraryPage,
} from "../packages/contracts/page-library";
import { uploadCommandSchema } from "../packages/contracts/media";
import { sniffAsset } from "../services/api/video-check";
import { validatePublication } from "../packages/domain/authoring";
import { baseStats, start, transition } from "../packages/domain/index";
import type { Story } from "../packages/contracts/index";
const record: LibraryPage = {
  id: "page-library-1",
  revision: 1,
  shared: false,
  content: {
    title: "A film",
    transcript: "A scene",
    pageType: "video",
    video: "/media/harbor.mp4",
    videoAdvance: "continue",
    outputs: [{ id: "next", label: "Continue" }],
  },
};
it("places one page in independent stories without copying destinations or state into the library", () => {
  const first = placePage(record, "first", "ending-a");
  const second = placePage(record, "second", "ending-b");
  expect(contentOf(first)).toEqual(contentOf(second));
  expect(first.choices).not.toEqual(second.choices);
  expect(first.sourcePage).toEqual(second.sourcePage);
  expect(
    pageContentSchema.safeParse({ ...record.content, storyId: "other" })
      .success,
  ).toBe(false);
  expect(
    pageContentSchema.safeParse({
      ...record.content,
      outputs: [{ id: "next", label: "Continue", targetPageId: "forged" }],
    }).success,
  ).toBe(false);
});
it("validates completion modes and preserves authoritative routing for manual video pages", () => {
  const story: Story = {
    id: "test",
    versionId: "v1",
    rulesetVersion: "prototype-1",
    title: "Test",
    entryPageId: "first",
    pages: {
      first: placePage(record, "first", "end"),
      end: {
        id: "end",
        title: "End",
        transcript: "",
        kind: "ending",
        pageType: "text",
        choices: [],
        entryEffects: [],
      },
    },
  };
  expect(validatePublication(story)).toBeTruthy();
  const save = start(story, "save", "user", baseStats, 0);
  expect(transition(story, save, "next", 0, 1, () => 1).save.status).toBe(
    "completed",
  );
  expect(() => transition(story, save, "forged", 0, 1, () => 1)).toThrow();
  expect(
    pageContentSchema.safeParse({
      ...record.content,
      pageType: "video-options",
    }).success,
  ).toBe(false);
  expect(
    pageContentSchema.safeParse({ ...record.content, outputs: [] }).success,
  ).toBe(false);
});
it("bounds and identifies reusable photo assets", () => {
  const image = {
    idempotencyKey: "photo",
    fileName: "photo.png",
    bytes: 100,
    contentType: "image/png",
    durationSeconds: 0,
  };
  expect(uploadCommandSchema.safeParse(image).success).toBe(true);
  expect(
    uploadCommandSchema.safeParse({ ...image, bytes: 11 * 1024 * 1024 })
      .success,
  ).toBe(false);
  expect(
    uploadCommandSchema.safeParse({ ...image, contentType: "image/svg+xml" })
      .success,
  ).toBe(false);
  expect(sniffAsset(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]))).toBe(
    "image/png",
  );
  expect(sniffAsset(new TextEncoder().encode("<svg/>"))).toBeNull();
});
