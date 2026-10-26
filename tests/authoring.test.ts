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

import {
  conditionKeys,
  isEditableCondition,
  validateCondition,
} from "../apps/web/src/condition-model";
import { evaluate } from "../packages/domain/index";
import { starterStory } from "../apps/web/src/studio-model";
import type { Condition } from "../packages/contracts/index";
it("authors bounded composite key conditions without trusting local entitlement aliases", () => {
  const story = starterStory("conditions");
  story.trunkContext = { version: 1, initialKeys: ["conditions:local"] };
  story.progression = {
    version: 1,
    keys: [{ keyId: "conditions:hero", label: "Hero", afterCompletions: 1 }],
  };
  story.accountKeys = {
    version: 1,
    keys: [
      { keyId: "conditions:bonus", label: "Bonus", definitionId: "definition" },
    ],
  };
  story.keyImports = {
    version: 1,
    keys: [
      {
        keyId: "conditions:relic",
        label: "Relic",
        sourceStoryId: "source",
        sourceVersionId: "v1",
        sourceKeyId: "source:relic",
        required: false,
      },
    ],
  };
  expect(conditionKeys(story).map((k) => k.scope)).toEqual([
    "run",
    "story",
    "import",
    "account",
  ]);
  const key = (keyId: string, scope: "run" | "account" = "run"): Condition => ({
    kind: "key",
    keyId,
    scope,
    present: true,
  });
  const c: Condition = {
    kind: "any",
    conditions: [
      {
        kind: "all",
        conditions: [
          key("conditions:local"),
          key("conditions:bonus", "account"),
        ],
      },
      { kind: "not", condition: key("conditions:local") },
    ],
  };
  expect(validateCondition(c, story)).toEqual(c);
  const save = start(story, "run", "player", baseStats, 1);
  save.keys.push("conditions:bonus");
  expect(evaluate(c, save)).toBe(false);
  expect(evaluate(c, save, ["conditions:bonus"])).toBe(true);
  const mixed: Condition = {
    kind: "all",
    conditions: [
      c,
      { kind: "roll", storyNodeId: "opening", op: "gte", value: 5 },
    ],
  };
  expect(isEditableCondition(mixed)).toBe(false);
  expect(() => validateCondition(mixed, story)).toThrow(/advanced JSON/);
  expect(() => validateCondition(key("other:key"), story)).toThrow(/namespace/);
  expect(() =>
    validateCondition(key("conditions:missing", "account"), story),
  ).toThrow(/declared/);
  let nested = key("conditions:local");
  for (let i = 0; i < 5; i++) nested = { kind: "not", condition: nested };
  expect(validateCondition(nested, story)).toEqual(nested);
  expect(() =>
    validateCondition({ kind: "not", condition: nested }, story),
  ).toThrow();
  expect(() =>
    validateCondition({ kind: "all", conditions: [] }, story),
  ).toThrow();
  expect(() =>
    validateCondition(
      { kind: "any", conditions: Array(11).fill(key("conditions:local")) },
      story,
    ),
  ).toThrow();
});
import {
  describeCondition,
  explainCondition,
} from "../packages/domain/preview";
it("validates mixed stat/item/key trees and explains every check using runtime semantics", () => {
  const story = starterStory("mixed");
  const save = start(story, "run", "player", baseStats, 1);
  const condition: Condition = {
    kind: "all",
    conditions: [
      { kind: "stat", stat: "agility", op: "gte", value: 6 },
      { kind: "item", itemId: "mixed:relic", op: "eq", quantity: 0 },
      {
        kind: "not",
        condition: { kind: "key", keyId: "mixed:door", present: true },
      },
    ],
  };
  expect(isEditableCondition(condition)).toBe(true);
  expect(validateCondition(condition, story)).toEqual(condition);
  expect(describeCondition(condition)).toContain("agility at least 6");
  expect(describeCondition(condition)).toContain("quantity exactly 0");
  const checks = explainCondition(condition, save);
  expect(checks.map((c) => [c.path, c.met])).toEqual([
    ["1", false],
    ["1.1", false],
    ["1.2", true],
    ["1.3", true],
    ["1.3.1", false],
  ]);
  expect(checks[1].actual).toBe("Current agility: 5");
  expect(checks[2].actual).toBe("Current quantity: 0");
  const before = structuredClone(save);
  explainCondition(condition, save);
  expect(save).toEqual(before);
  for (const op of ["gte", "lte", "eq"] as const) {
    for (const n of [0, 5, 999]) {
      const c: Condition = { kind: "stat", stat: "agility", op, value: n };
      expect(explainCondition(c, save)[0].met).toBe(evaluate(c, save));
    }
  }
  for (const quantity of [-1, 1.5, 1000, NaN])
    expect(() =>
      validateCondition(
        { kind: "item", itemId: "mixed:relic", op: "gte", quantity },
        story,
      ),
    ).toThrow();
  expect(() =>
    validateCondition(
      { kind: "item", itemId: "other:relic", op: "gte", quantity: 1 },
      story,
    ),
  ).toThrow(/namespace/);
  const account: Condition = {
    kind: "key",
    keyId: "mixed:account",
    scope: "account",
    present: true,
  };
  save.keys.push("mixed:account");
  expect(explainCondition(account, save)[0].actual).toBe("Currently absent");
  expect(explainCondition(account, save, ["mixed:account"])[0].met).toBe(true);
});
import {
  itemRoutes,
  validateBranchItems,
} from "../apps/web/src/branch-items-model";
it("preserves route effects and atomically spends then awards local inventory", () => {
  const story = starterStory("items");
  const choice = structuredClone(story.storyNodes.opening.choices[0]);
  choice.costs = [
    { itemId: "items:relic", quantity: 1 },
    { itemId: "items:relic", quantity: 1 },
  ];
  const routes = itemRoutes(choice);
  routes[0].route.effects = [
    { id: "score", kind: "score", scoreId: "items:score", delta: 1 },
    { id: "reward", kind: "item", itemId: "items:relic", delta: 3 },
  ];
  expect(validateBranchItems(choice, story.id)).toEqual(choice);
  story.storyNodes.opening.choices = [choice];
  const save = start(story, "run", "player", baseStats, 1);
  save.items["items:relic"] = 2;
  const result = transition(story, save, choice.id, 0, 2).save;
  expect(result.items["items:relic"]).toBe(3);
  expect(result.scores?.["items:score"]).toBe(1);
  expect(save.items["items:relic"]).toBe(2);
  save.items["items:relic"] = 1;
  expect(() => transition(story, save, choice.id, 0, 2)).toThrow(/items/);
  expect(save.items["items:relic"]).toBe(1);
  save.items["items:relic"] = 999;
  expect(() => transition(story, save, choice.id, 0, 2)).toThrow(/bounds/);
  expect(save.items["items:relic"]).toBe(999);
  const invalid = structuredClone(choice);
  invalid.costs[0].itemId = "other:relic";
  expect(() => validateBranchItems(invalid, story.id)).toThrow(/namespace/);
  invalid.costs = [];
  itemRoutes(invalid)[0].route.effects.push({
    id: "bad",
    kind: "item",
    itemId: "items:relic",
    delta: 100,
  });
  expect(() => validateBranchItems(invalid, story.id)).toThrow();
  const dice = {
    ...choice,
    outcome: {
      kind: "dice" as const,
      sides: 20,
      target: 10,
      success: structuredClone(routes[0].route),
      failure: { targetStoryNodeId: "ending", effects: [] },
    },
  };
  expect(itemRoutes(dice).map((r) => r.label)).toEqual(["Pass", "Fail"]);
  expect(validateBranchItems(dice, story.id).outcome).toEqual(dice.outcome);
  choice.costs = [{ itemId: "items:missing", quantity: 0 }];
  itemRoutes(choice)[0].route.effects = [];
  const empty = start(story, "empty", "player", baseStats, 1);
  expect(
    transition(story, empty, choice.id, 0, 2).save.items["items:missing"],
  ).toBe(0);
});
