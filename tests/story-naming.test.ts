import { describe, expect, it } from "vitest";
import {
  legacyCommand,
  legacyStoryData,
  readStoryData,
  storyApiPath,
  storyPreviewPath,
} from "../packages/contracts/legacy-story-format";
import { storyNodeStories } from "../fixtures/story-node-stories";
import { storySchema } from "../packages/contracts/index";

describe("Story naming compatibility", () => {
  it("round-trips complete editions without changing content, destinations or dictionary IDs", () => {
    const story = structuredClone(storyNodeStories[0]);
    story.storyNodes.pageId = {
      ...Object.values(story.storyNodes)[0],
      id: "pageId",
    };
    const legacy = legacyStoryData(story);
    expect(storySchema.parse(readStoryData(legacy))).toEqual(story);
    expect(
      readStoryData({ pagePositions: { pageId: { x: 1, y: 2 } } }),
    ).toEqual({ storyNodePositions: { pageId: { x: 1, y: 2 } } });
    expect(
      readStoryData({ items: { pageId: 2 }, scores: { pages: 4 } }),
    ).toEqual({ items: { pageId: 2 }, scores: { pages: 4 } });
  });

  it("keeps pending rolls and nested condition references and rejects ambiguous aliases", () => {
    expect(
      readStoryData({
        pageId: "dice",
        lastRoll: { pageId: "dice", value: 14, pending: true },
      }),
    ).toEqual({
      storyNodeId: "dice",
      lastRoll: { storyNodeId: "dice", value: 14, pending: true },
    });
    expect(
      readStoryData({
        kind: "all",
        conditions: [{ kind: "roll", pageId: "dice", value: 16 }],
      }),
    ).toEqual({
      kind: "all",
      conditions: [{ kind: "roll", storyNodeId: "dice", value: 16 }],
    });
    expect(() => readStoryData({ pageId: "a", storyNodeId: "b" })).toThrow(
      "Conflicting",
    );
    expect(
      storySchema.safeParse({ id: "old", entryNodeId: "a", nodes: {} }).success,
    ).toBe(false);
  });

  it("preserves receipt fingerprints and maps only the intended URL prefixes", () => {
    expect(
      legacyCommand({
        segments: ["api", "story-nodes", "abc"],
        command: { content: { storyNodeType: "text" } },
      }),
    ).toEqual({
      segments: ["api", "pages", "abc"],
      command: { content: { pageType: "text" } },
    });
    expect(storyApiPath("/api/pages/abc")).toBe("/api/story-nodes/abc");
    expect(storyApiPath("/api/shared-pages/abc/1")).toBe(
      "/api/shared-story-nodes/abc/1",
    );
    expect(storyApiPath("/api/pages-other")).toBe("/api/pages-other");
    expect(storyPreviewPath("/p/abc/1")).toBe("/story-nodes/abc/1");
  });
});
