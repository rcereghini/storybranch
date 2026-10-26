import { it, expect } from "vitest";
import {
  reviewPublication,
  validatePublication,
} from "../packages/domain/authoring";
import { start, baseStats, transition } from "../packages/domain/index";
import { blankStory } from "../apps/web/src/studio-model";
import { draftSchema } from "../packages/contracts/authoring";
import { savedPlaytestScenariosSchema } from "../packages/contracts/preview";
import {
  previewScenarioIssues,
  startPreview,
  previewPreset,
} from "../packages/domain/preview";
import type { Story } from "../packages/contracts/index";
import { branchDataStory } from "../fixtures/branch-data";
import {
  inputBindingIssue,
  resolveNodeInputs,
} from "../packages/domain/branch-data";
import {
  readStoryData,
  legacyStoryData,
} from "../packages/contracts/legacy-story-format";
import {
  nodeInputsSchema,
  inputBindingsSchema,
} from "../packages/contracts/branch-data";
import { renderStoryNode, playerRun } from "../packages/domain/player";

it("preserves falsy defaults, omits optional inputs and isolates child entries", () => {
  const story = branchDataStory();
  const entry = story.storyNodes.dice;
  entry.inputs = {
    version: 1,
    fields: [
      { name: "zero", type: "integer", required: true, default: 0 },
      { name: "falseValue", type: "boolean", required: true, default: false },
      { name: "empty", type: "string", required: true, default: "" },
      { name: "optional", type: "integer", required: false },
    ],
  };
  const parent = start(story, "parent", "player", baseStats, 0);
  parent.nodeInputs!.values.zero = 8;
  expect(
    start(story, "child", "player", baseStats, 1, parent).nodeInputs?.values,
  ).toEqual({ zero: 0, falseValue: false, empty: "" });
  const unknown = {
    version: 1 as const,
    bindings: [
      { input: "unknown", source: { kind: "constant" as const, value: 1 } },
    ],
  };
  expect(inputBindingIssue(entry, unknown)).toContain(
    "Unknown destination input",
  );
  expect(() => resolveNodeInputs(entry, 1, unknown)).toThrow();
  delete entry.inputs;
  expect(start(story, "old", "player", baseStats, 0)).not.toHaveProperty(
    "nodeInputs",
  );
});

it("validates bounded typed input declarations and binding syntax", () => {
  const saved = {
    nodeInputs: {
      version: 1,
      storyNodeId: "test",
      revision: 1,
      values: { pageId: "unchanged", storyNodeId: "also-unchanged" },
    },
  };
  expect(readStoryData(legacyStoryData(saved))).toEqual(saved);
  const field = { name: "value", type: "integer", required: true, default: 3 };
  for (const invalid of [
    { ...field, default: true },
    { ...field, default: 1000 },
    { ...field, default: 1.5 },
    { ...field, name: "constructor" },
    { ...field, name: "__proto__" },
    { ...field, default: null },
    { ...field, expression: "save.health" },
  ])
    expect(
      nodeInputsSchema.safeParse({ version: 1, fields: [invalid] }).success,
    ).toBe(false);
  expect(nodeInputsSchema.safeParse({ version: 2, fields: [] }).success).toBe(
    false,
  );
  expect(
    nodeInputsSchema.safeParse({ version: 1, fields: [field, field] }).success,
  ).toBe(false);
  expect(
    nodeInputsSchema.safeParse({
      version: 1,
      fields: Array.from({ length: 17 }, (_, i) => ({
        ...field,
        name: `v${i}`,
      })),
    }).success,
  ).toBe(false);
  const binding = { input: "value", source: { kind: "constant", value: 2 } };
  expect(
    inputBindingsSchema.safeParse({ version: 1, bindings: [binding, binding] })
      .success,
  ).toBe(false);
  expect(
    inputBindingsSchema.safeParse({
      version: 1,
      bindings: [
        { input: "value", source: { kind: "dice", field: "arbitrary.path" } },
      ],
    }).success,
  ).toBe(false);
});

it("resolves Dice inputs only on Next and replaces snapshots on revisits and exits", () => {
  for (const value of [14, 16, 20]) {
    const story = validatePublication(branchDataStory());
    const initial = start(story, "test", "player", baseStats, 0);
    expect(initial.nodeInputs?.values).toEqual({ attempt: 1 });
    expect(() => transition(story, initial, "roll", 0, 1)).toThrow(
      "Roll before",
    );
    const rolled = transition(
      story,
      initial,
      "roll",
      0,
      1,
      () => value,
      "roll",
    ).save;
    expect(rolled.nodeInputs).toEqual(initial.nodeInputs);
    const entered = transition(
      story,
      JSON.parse(JSON.stringify(rolled)),
      "roll",
      1,
      2,
    ).save;
    expect(entered.nodeInputs).toEqual({
      version: 1,
      storyNodeId: "summary",
      revision: 2,
      values: {
        roll: value,
        passed: value >= 16,
        secret: "private-input-marker",
      },
    });
    expect(
      JSON.stringify(renderStoryNode(story.storyNodes.summary, entered)),
    ).not.toContain("private-input-marker");
    expect(JSON.stringify(playerRun(entered))).not.toContain("nodeInputs");
    const repeated = transition(story, entered, "Again", 2, 3).save;
    expect(repeated.nodeInputs).toEqual({ ...initial.nodeInputs, revision: 3 });
    expect(() => transition(story, repeated, "roll", 3, 4)).toThrow(
      "Roll before",
    );
    const finished = transition(story, entered, "Finish", 2, 3).save;
    expect(finished).not.toHaveProperty("nodeInputs");
    expect(rolled.lastRoll?.pending).toBe(true);
  }
});

it("checks every incoming edge and suppresses incompatible optional choices", () => {
  const story = branchDataStory();
  const source = story.storyNodes.summary;
  source.choices.push({
    id: "bad",
    label: "bad",
    costs: [],
    unavailableDisplay: "hidden",
    outcome: {
      kind: "direct",
      route: {
        targetStoryNodeId: "summary",
        effects: [],
        inputBindings: {
          version: 1,
          bindings: [
            {
              input: "roll",
              source: { kind: "constant", value: "wrong type" },
            },
            { input: "passed", source: { kind: "constant", value: false } },
          ],
        },
      },
    },
  });
  const review = reviewPublication(story);
  expect(review.story?.storyNodes.summary.choices.map((c) => c.id)).toEqual([
    "Finish",
    "Again",
  ]);
  expect(review.diagnostics).toContainEqual(
    expect.objectContaining({
      choiceId: "bad",
      message: expect.stringContaining("Incompatible input type"),
    }),
  );
  const bad = source.choices[2].outcome;
  if (bad.kind !== "direct") throw new Error("Fixture");
  bad.route.inputBindings!.bindings[0].source = { kind: "constant", value: 7 };
  const valid = validatePublication(story);
  const roll = transition(
    valid,
    start(valid, "run", "player", baseStats, 0),
    "roll",
    0,
    1,
    () => 16,
    "roll",
  ).save;
  const summary = transition(valid, roll, "roll", 1, 2).save;
  expect(
    transition(valid, summary, "bad", 2, 3).save.nodeInputs?.values,
  ).toEqual({ roll: 7, passed: false, secret: "private-input-marker" });
  bad.route.inputBindings!.bindings[0].source = {
    kind: "dice",
    field: "value",
  };
  expect(
    reviewPublication(story).diagnostics.some((d) =>
      d.message.includes("current Dice"),
    ),
  ).toBe(true);
});

it("rejects a required Dice outcome or root input without a compatible source", () => {
  const story = branchDataStory();
  const outcome = story.storyNodes.dice.choices[0].outcome;
  if (outcome.kind !== "dice") throw new Error("Fixture");
  delete outcome.failure.inputBindings;
  expect(reviewPublication(story).story).toBeUndefined();
  const root = branchDataStory();
  delete root.storyNodes.dice.inputs!.fields[0].default;
  expect(reviewPublication(root).error).toContain(
    "Required input has no source",
  );
});

it("bounds private saved setups, preserves stale local references and rejects loading them", () => {
  const story = blankStory("setups");
  const scenario = {
    ...previewPreset(story, "first"),
    items: { "setups:removed": 2 },
    storyKeys: ["setups:old"],
  };
  const entry = { id: "one", name: " Returning player ", scenario };
  expect(
    draftSchema.parse({ story, description: "", playtestScenarios: [entry] })
      .playtestScenarios?.[0].name,
  ).toBe("Returning player");
  expect(previewScenarioIssues(story, scenario)).toEqual([
    "Item unavailable: setups:removed",
    "Story key unavailable: setups:old",
  ]);
  expect(() => startPreview(story, scenario, 1)).toThrow();
  expect(
    savedPlaytestScenariosSchema.safeParse([
      entry,
      { ...entry, id: "two", name: "returning player" },
    ]).success,
  ).toBe(false);
  expect(
    savedPlaytestScenariosSchema.safeParse(
      Array.from({ length: 21 }, (_, i) => ({
        ...entry,
        id: `s${i}`,
        name: `Setup ${i}`,
      })),
    ).success,
  ).toBe(false);
  expect(
    draftSchema.safeParse({
      story,
      description: "",
      playtestScenarios: [
        { ...entry, scenario: { ...scenario, items: { "foreign:item": 1 } } },
      ],
    }).success,
  ).toBe(false);
  expect(
    savedPlaytestScenariosSchema.safeParse([
      { ...entry, scenario: { ...scenario, items: { "setups:item": 1000 } } },
    ]).success,
  ).toBe(false);
  expect(draftSchema.safeParse({ story, description: "" }).success).toBe(true);
});
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
import {
  itemReferences,
  storyItems,
  itemLabel,
} from "../packages/domain/story-items";
import { storySchema } from "../packages/contracts/index";
it("validates optional item metadata without changing legacy references or granting inventory", () => {
  const story = starterStory("catalogue");
  story.storyNodes.opening.choices[0].costs = [
    { itemId: "catalogue:old", quantity: 1 },
  ];
  expect(storyItems(story)[0]).toMatchObject({
    itemId: "catalogue:old",
    catalogued: false,
  });
  story.itemCatalogue = {
    version: 1,
    items: [
      { itemId: "catalogue:old", name: "Old relic", description: "A relic" },
      { itemId: "catalogue:new", name: "New relic", description: "" },
    ],
  };
  expect(storySchema.parse(story).itemCatalogue).toEqual(story.itemCatalogue);
  expect(itemLabel(story, "catalogue:old")).toBe("Old relic (catalogue:old)");
  expect(itemReferences(story)).toEqual([
    expect.objectContaining({
      itemId: "catalogue:old",
      storyNodeId: "opening",
      location: expect.stringContaining("cost"),
    }),
  ]);
  expect(storyItems(story)).toHaveLength(2);
  expect(start(story, "run", "player", baseStats, 1).items).toEqual({});
  for (const items of [
    [{ itemId: "other:old", name: "Foreign", description: "" }],
    [story.itemCatalogue.items[0], story.itemCatalogue.items[0]],
    [{ itemId: "catalogue:old", name: "", description: "" }],
    [{ itemId: "catalogue:old", name: "Valid", description: "x".repeat(501) }],
    Array.from({ length: 101 }, (_, i) => ({
      itemId: `catalogue:item-${i}`,
      name: "Item",
      description: "",
    })),
  ])
    expect(
      storySchema.safeParse({ ...story, itemCatalogue: { version: 1, items } })
        .success,
    ).toBe(false);
});
