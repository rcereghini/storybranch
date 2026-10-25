import { it, expect } from "vitest";
import {
  reviewPublication,
  validatePublication,
} from "../packages/domain/authoring";
import { start, baseStats, transition } from "../packages/domain/index";
import { blankStory } from "../apps/web/src/studio-model";
import { draftSchema } from "../packages/contracts/authoring";
import type { Story } from "../packages/contracts/index";
import {
  accountFeatures,
  allFeatures,
  profileUpdateSchema,
  storedFeatures,
} from "../packages/contracts/profile";
it("grants a feature only when the profile flag is exactly true", () => {
  const none = {
    publish: false,
    generate: false,
    copilot: false,
    admin: false,
  };
  expect(accountFeatures(undefined)).toEqual(none);
  expect(accountFeatures({})).toEqual(none);
  expect(accountFeatures({ features: "publish" })).toEqual(none);
  expect(
    accountFeatures({
      features: {
        publish: "true",
        generate: 1,
        copilot: null,
        admin: "yes",
        root: true,
      },
    }),
  ).toEqual(none);
  expect(accountFeatures({ features: { publish: true } })).toEqual({
    ...none,
    publish: true,
  });
  expect(accountFeatures({ features: allFeatures })).toEqual(allFeatures);
});
it("gives admins every feature while keeping their stored flags as set", () => {
  const admin = { features: { admin: true, copilot: false } };
  expect(accountFeatures(admin)).toEqual(allFeatures);
  expect(storedFeatures(admin)).toEqual({
    publish: false,
    generate: false,
    copilot: false,
    admin: true,
  });
});
it("never lets a player set their own feature flags", () => {
  expect(
    profileUpdateSchema.safeParse({
      displayName: "Ada",
      avatarId: "lantern",
      features: allFeatures,
    }).success,
  ).toBe(false);
});
export const draftStory = (id = "test-story"): Story => ({
  id,
  title: "Test story",
  versionId: "draft",
  rulesetVersion: "prototype-1",
  entryStoryNodeId: "opening",
  storyNodes: {
    opening: {
      id: "opening",
      title: "Opening",
      storyNodeType: "text",
      kind: "scene",
      transcript: "A new journey.",
      entryEffects: [],
      choices: [
        {
          id: "next",
          label: "Next",
          costs: [],
          unavailableDisplay: "locked",
          outcome: {
            kind: "direct",
            route: { targetStoryNodeId: "ending", effects: [] },
          },
        },
      ],
    },
    ending: {
      id: "ending",
      title: "Ending",
      storyNodeType: "text",
      kind: "ending",
      transcript: "Home again.",
      entryEffects: [],
      choices: [],
    },
  },
});
it("publishes safe paths and preserves excluded draft work without rerouting", () => {
  expect(validatePublication(draftStory()).title).toBe("Test story");
  const missing = draftStory();
  delete missing.storyNodes.ending;
  expect(() => validatePublication(missing)).toThrow("StoryTrunk");
  const unused = draftStory();
  unused.storyNodes.unused = { ...unused.storyNodes.ending, id: "unused" };
  expect(validatePublication(unused).storyNodes).not.toHaveProperty("unused");
  expect(unused.storyNodes).toHaveProperty("unused");
  const trapped = draftStory();
  trapped.storyNodes.opening.storyNodeType = "text-options";
  trapped.storyNodes.opening.choices.push({
    ...trapped.storyNodes.opening.choices[0],
    id: "loop",
    outcome: {
      kind: "direct",
      route: { targetStoryNodeId: "loop", effects: [] },
    },
  });
  trapped.storyNodes.loop = {
    ...trapped.storyNodes.opening,
    id: "loop",
    choices: [trapped.storyNodes.opening.choices[1]],
  };
  const review = reviewPublication(trapped);
  expect(review.story!.storyNodes.opening.choices.map((c) => c.id)).toEqual([
    "next",
  ]);
  expect(review.story!.storyNodes).not.toHaveProperty("loop");
  expect(review.diagnostics.some((d) => d.choiceId === "loop")).toBe(true);
  const save = start(review.story!, "run", "user", baseStats, 0);
  expect(() => transition(review.story!, save, "loop", 0, 1)).toThrow();
});

it("saves blank trunks but requires a safe start, and snapshots local starting keys", () => {
  const blank = blankStory("test-story");
  expect(
    draftSchema.parse({ story: blank, description: "" }).story.storyNodes,
  ).toEqual({});
  expect(() => validatePublication(blank)).toThrow("StoryTrunk");
  const story = draftStory();
  story.trunkContext = { version: 1, initialKeys: ["test-story:invitation"] };
  const compiled = validatePublication(story);
  const save = start(compiled, "run", "user", baseStats, 0);
  expect(save.keys).toEqual(["test-story:invitation"]);
  story.trunkContext.initialKeys.push("test-story:later");
  expect(save.keys).toEqual(["test-story:invitation"]);
  story.trunkContext.initialKeys = ["platform:premium"];
  expect(() => validatePublication(story)).toThrow("Foreign namespace");
});

it("propagates unsafe required dice outcomes and gated-only exits upstream", () => {
  const story = draftStory();
  story.storyNodes.opening.storyNodeType = "text-options";
  story.storyNodes.opening.choices.push({
    ...structuredClone(story.storyNodes.opening.choices[0]),
    id: "risk",
    outcome: {
      kind: "direct",
      route: { targetStoryNodeId: "dice", effects: [] },
    },
  });
  story.storyNodes.dice = {
    ...structuredClone(story.storyNodes.opening),
    id: "dice",
    storyNodeType: "dice",
    choices: [
      {
        id: "roll",
        label: "Roll",
        costs: [],
        unavailableDisplay: "locked",
        outcome: {
          kind: "dice",
          sides: 20,
          target: 16,
          success: { targetStoryNodeId: "ending", effects: [] },
          failure: { targetStoryNodeId: "missing", effects: [] },
        },
      },
    ],
  };
  expect(
    validatePublication(story).storyNodes.opening.choices.map((c) => c.id),
  ).toEqual(["next"]);
  story.storyNodes.opening.choices[0].availableWhen = {
    kind: "key",
    keyId: "test-story:key",
    present: true,
  };
  expect(() => validatePublication(story)).toThrow("StoryTrunk");
});

it("keeps voluntary loops with safe exits but rejects unavoidable automatic loops", () => {
  const story = draftStory();
  const next = story.storyNodes.opening.choices[0];
  story.storyNodes.opening.storyNodeType = "text-options";
  story.storyNodes.opening.choices.push({
    ...structuredClone(next),
    id: "again",
    outcome: {
      kind: "direct",
      route: { targetStoryNodeId: "opening", effects: [] },
    },
  });
  expect(validatePublication(story).storyNodes.opening.choices).toHaveLength(2);
  story.storyNodes.opening.storyNodeType = "text";
  story.storyNodes.opening.choices.shift();
  expect(() => validatePublication(story)).toThrow("StoryTrunk");
});
it("allows incomplete private drafts while bounding authoring payloads", () => {
  const story = draftStory();
  delete story.storyNodes.ending;
  expect(draftSchema.safeParse({ story, description: "" }).success).toBe(true);
  expect(
    draftSchema.safeParse({ story, description: "x".repeat(501) }).success,
  ).toBe(false);
});
