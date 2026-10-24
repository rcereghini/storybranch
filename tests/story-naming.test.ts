import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  legacyCommand,
  legacyStoryData,
  legacyStoryFields,
  readStoryData,
  storyApiPath,
  storyDictionaries,
  storyPreviewPath,
} from "../packages/contracts/legacy-story-format";
import { storyNodeStories } from "../fixtures/story-node-stories";
import { storySchema } from "../packages/contracts/index";
import * as admin from "../packages/contracts/admin";
import * as assist from "../packages/contracts/assist";
import * as authoring from "../packages/contracts/authoring";
import * as copilot from "../packages/contracts/copilot";
import * as generation from "../packages/contracts/generation";
import * as contracts from "../packages/contracts/index";
import * as media from "../packages/contracts/media";
import * as profile from "../packages/contracts/profile";
import * as library from "../packages/contracts/story-node-library";

// Field names of every map keyed by free-form IDs reachable from a schema.
// Enum-keyed maps have a fixed vocabulary that cannot collide with a rename.
function idKeyedMaps(
  schema: z.ZodTypeAny,
  field: string | undefined,
  found: Set<string>,
  seen: Map<z.ZodTypeAny, Set<string | undefined>>,
) {
  // A schema exported on its own is reached again under its field name.
  const fields = seen.get(schema) ?? new Set();
  if (fields.has(field)) return;
  seen.set(schema, fields.add(field));
  const next = (s: z.ZodTypeAny, f = field) => idKeyedMaps(s, f, found, seen);
  if (schema instanceof z.ZodObject)
    for (const [key, value] of Object.entries(schema.shape))
      next(value as z.ZodTypeAny, key);
  else if (schema instanceof z.ZodRecord) {
    if (!(schema.keySchema instanceof z.ZodEnum) && field) found.add(field);
    next(schema.valueSchema);
  } else if (schema instanceof z.ZodArray) next(schema.element);
  else if (
    schema instanceof z.ZodOptional ||
    schema instanceof z.ZodNullable ||
    schema instanceof z.ZodDefault ||
    schema instanceof z.ZodReadonly ||
    schema instanceof z.ZodCatch
  )
    next(schema._def.innerType);
  else if (schema instanceof z.ZodEffects) next(schema.innerType());
  else if (schema instanceof z.ZodLazy) next(schema.schema);
  else if (
    schema instanceof z.ZodUnion ||
    schema instanceof z.ZodDiscriminatedUnion
  )
    for (const option of schema.options) next(option);
  else if (schema instanceof z.ZodIntersection) {
    next(schema._def.left);
    next(schema._def.right);
  } else if (schema instanceof z.ZodTuple)
    for (const item of schema.items) next(item);
  else if (schema instanceof z.ZodPipeline) {
    next(schema._def.in);
    next(schema._def.out);
  } else if (schema instanceof z.ZodBranded) next(schema.unwrap());
}

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

  it("keeps the IDs of every ID-keyed map in the contracts", () => {
    const found = new Set<string>();
    const seen = new Map<z.ZodTypeAny, Set<string | undefined>>();
    for (const module of [
      admin,
      assist,
      authoring,
      copilot,
      generation,
      contracts,
      media,
      profile,
      library,
    ])
      for (const value of Object.values(module))
        if (value instanceof z.ZodType)
          idKeyedMaps(value, undefined, found, seen);
    expect([...found]).toEqual(
      expect.arrayContaining(["storyNodes", "storyNodePositions"]),
    );
    // Maps typed only in TypeScript: Save inventory/quiz/stats and edition clips.
    for (const field of [
      ...found,
      "items",
      "scores",
      "stats",
      "statsSnapshot",
      "clips",
    ])
      expect(storyDictionaries, field).toContain(field);
    // A renamed map must stay a map under both its old and new name.
    for (const [legacy, current] of Object.entries(legacyStoryFields))
      expect(storyDictionaries.has(legacy), legacy).toBe(
        storyDictionaries.has(current),
      );
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
