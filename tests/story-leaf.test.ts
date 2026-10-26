import { expect, it } from "vitest";
import {
  completionSchema,
  storyLeafSchema,
  startSchema,
  branchCommandSchema,
} from "../packages/contracts/index";
import {
  start,
  transition,
  baseStats,
  validateStory,
} from "../packages/domain/index";
import { validatePublication } from "../packages/domain/authoring";
import { playerRun, renderStoryNode } from "../packages/domain/player";
import { starterStory } from "../apps/web/src/studio-model";

it("requires unique, consented source-run selections and bounded local exports", () => {
  const payload = {
    storyId: "sequel",
    versionId: "edition-1",
    importConsent: true,
    sourceRuns: [
      {
        sourceStoryId: "prequel",
        sourceVersionId: "edition-1",
        runId: "run-a",
      },
    ],
  };
  const command = { idempotencyKey: "start", payload };
  expect(startSchema.safeParse(command).success).toBe(true);
  expect(
    startSchema.safeParse({
      ...command,
      payload: { ...payload, importConsent: false },
    }).success,
  ).toBe(false);
  expect(
    startSchema.safeParse({
      ...command,
      payload: { ...payload, versionId: undefined },
    }).success,
  ).toBe(false);
  expect(
    startSchema.safeParse({
      ...command,
      payload: {
        ...payload,
        sourceRuns: [
          ...payload.sourceRuns,
          { ...payload.sourceRuns[0], runId: "run-b" },
        ],
      },
    }).success,
  ).toBe(false);
  const story = starterStory("prequel");
  story.runKeyExports = {
    version: 1,
    keys: [
      {
        keyId: "prequel:rescuer",
        label: "Rescuer",
        exportToStoryIds: ["sequel"],
      },
    ],
  };
  expect(validatePublication(story).runKeyExports).toEqual(story.runKeyExports);
  story.runKeyExports.keys[0].keyId = "foreign:rescuer";
  expect(() => validateStory(story)).toThrow(/Foreign namespace/);
});

it("isolates imported aliases from local effects and hides their provenance", () => {
  const story = starterStory("sequel");
  story.keyImports = {
    version: 1,
    keys: [
      {
        keyId: "sequel:hero",
        label: "Hero",
        sourceStoryId: "prequel",
        sourceVersionId: "edition-1",
        sourceKeyId: "prequel:hero",
        required: false,
      },
    ],
  };
  story.trunkContext = { version: 1, initialKeys: ["sequel:hero"] };
  const opening = story.storyNodes.opening;
  opening.storyNodeType = "text-options";
  opening.choices.push({
    ...structuredClone(opening.choices[0]),
    id: "imported",
    label: "Imported",
    unavailableDisplay: "hidden",
    availableWhen: {
      kind: "key",
      scope: "import",
      keyId: "sequel:hero",
      present: true,
    },
  });
  const published = validatePublication(story);
  const empty = start(published, "run", "user", baseStats, 1);
  expect(
    renderStoryNode(opening, empty).outputs.map((o) => o.id),
  ).not.toContain("imported");
  expect(() => transition(published, empty, "imported", 0, 2)).toThrow();
  const snapshot = {
    version: 1 as const,
    consented: true,
    at: 1,
    keys: [
      {
        keyId: "sequel:hero",
        present: true,
        sourceStoryId: "prequel",
        sourceVersionId: "edition-1",
        sourceKeyId: "prequel:hero",
        grant: { runId: "source-run", versionId: "edition-1", at: 0 },
      },
    ],
  };
  const granted = start(
    published,
    "granted",
    "user",
    baseStats,
    1,
    undefined,
    undefined,
    snapshot,
  );
  snapshot.keys[0].present = false;
  expect(transition(published, granted, "imported", 0, 2).save.status).toBe(
    "completed",
  );
  expect(playerRun(granted)).not.toHaveProperty("keyImportSnapshot");
  delete story.keyImports;
  expect(() => validateStory(story)).toThrow(/declared alias/);
});

it("keeps persistent key conditions separate from run keys and omits the snapshot from player data", () => {
  const story = starterStory("progress-test");
  story.progression = {
    version: 1,
    keys: [
      { keyId: "progress-test:bonus", label: "Bonus", afterCompletions: 5 },
    ],
  };
  story.storyNodes.opening.storyNodeType = "text-options";
  const ordinary = story.storyNodes.opening.choices[0];
  story.storyNodes.opening.choices.push({
    ...structuredClone(ordinary),
    id: "bonus",
    label: "Bonus path",
    unavailableDisplay: "hidden",
    availableWhen: {
      kind: "key",
      scope: "story",
      keyId: "progress-test:bonus",
      present: true,
    },
  });
  validatePublication(story);
  const local = start(story, "run", "user", baseStats, 1);
  local.keys.push("progress-test:bonus");
  expect(
    renderStoryNode(story.storyNodes.opening, local).outputs.map((o) => o.id),
  ).not.toContain("bonus");
  expect(() => transition(story, local, "bonus", 0, 2)).toThrow();
  const unlocked = start(story, "next", "user", baseStats, 2, undefined, {
    version: 1,
    keys: ["progress-test:bonus"],
  });
  expect(
    renderStoryNode(story.storyNodes.opening, unlocked).outputs.map(
      (o) => o.id,
    ),
  ).toContain("bonus");
  expect(transition(story, unlocked, "bonus", 0, 3).save.status).toBe(
    "completed",
  );
  expect(playerRun(unlocked)).not.toHaveProperty("storyProgressSnapshot");
  delete story.progression;
  expect(() => validateStory(story)).toThrow(/declared persistent key/);
});

it("rejects foreign, duplicate and invalid persistent key definitions and unsupported account checks", () => {
  const story = starterStory("progress-test");
  story.progression = {
    version: 1,
    keys: [{ keyId: "foreign:key", label: "Key", afterCompletions: 1 }],
  };
  expect(() => validateStory(story)).toThrow(/Foreign namespace/);
  story.progression.keys[0].keyId = "progress-test:key";
  story.progression.keys[0].afterCompletions = 0;
  expect(() => validateStory(story)).toThrow();
  story.progression.keys[0].afterCompletions = 1;
  story.progression.keys.push(story.progression.keys[0]);
  expect(() => validateStory(story)).toThrow(/unique/);
  story.progression.keys.pop();
  story.storyNodes.opening.choices[0].availableWhen = {
    kind: "key",
    keyId: "progress-test:key",
    present: true,
    scope: "account",
  } as never;
  expect(() => validateStory(story)).toThrow();
});

function fixture() {
  const story = starterStory("leaf-test");
  story.trunkContext!.initialKeys = ["leaf-test:known"];
  story.storyNodes.ending.leaf = {
    version: 1,
    summary: "The harbor remembers.",
    rewards: [
      { keyId: "leaf-test:rescuer", label: "Harbor rescuer" },
      { keyId: "leaf-test:known", label: "Old friend" },
    ],
  };
  return story;
}
it("records a bounded completion and grants local keys only on committed entry", () => {
  const story = validatePublication(fixture());
  const before = start(story, "run", "user", baseStats, 10);
  expect(before.completion).toBeUndefined();
  expect(renderStoryNode(story.storyNodes.ending, before)).not.toHaveProperty(
    "leaf",
  );
  const finished = transition(
    story,
    before,
    story.storyNodes.opening.choices[0].id,
    0,
    20,
  ).save;
  expect(before.keys).toEqual(["leaf-test:known"]);
  expect(finished.keys).toEqual(["leaf-test:known", "leaf-test:rescuer"]);
  expect(completionSchema.parse(finished.completion)).toEqual({
    version: 1,
    storyNodeId: "ending",
    revision: 1,
    at: 20,
    summary: "The harbor remembers.",
    rewards: [
      {
        keyId: "leaf-test:rescuer",
        label: "Harbor rescuer",
        newlyGranted: true,
      },
      { keyId: "leaf-test:known", label: "Old friend", newlyGranted: false },
    ],
  });
  expect(playerRun(finished).completion).toEqual(finished.completion);
  expect(() => transition(story, finished, "anything", 1, 30)).toThrow(
    "unavailable",
  );
});
it("supports entry leaves, independent replay/child runs, and old receipts remaining absent", () => {
  const story = fixture();
  story.entryStoryNodeId = "ending";
  const parent = start(
    starterStory("parent"),
    "parent-run",
    "user",
    baseStats,
    1,
  );
  const child = start(story, "child", "user", baseStats, 2, parent);
  const replay = start(story, "replay", "user", baseStats, 3);
  expect(child.completion?.revision).toBe(0);
  expect(child.completion?.rewards[0].newlyGranted).toBe(true);
  expect(replay.completion?.rewards[0].newlyGranted).toBe(true);
  expect(parent.keys).not.toContain("leaf-test:rescuer");
  const { completion: _, ...legacy } = child;
  expect(playerRun(legacy)).not.toHaveProperty("completion");
});
it("rejects foreign, duplicate, excessive and non-leaf reward definitions", () => {
  const story = fixture();
  story.storyNodes.ending.leaf!.rewards[0].keyId = "platform:premium";
  expect(() => validatePublication(story)).toThrow();
  const definition = fixture().storyNodes.ending.leaf!;
  expect(
    storyLeafSchema.safeParse({
      ...definition,
      rewards: [definition.rewards[0], definition.rewards[0]],
    }).success,
  ).toBe(false);
  expect(
    storyLeafSchema.safeParse({
      ...definition,
      rewards: Array.from({ length: 21 }, (_, i) => ({
        keyId: `leaf-test:key-${i}`,
        label: "Reward",
      })),
    }).success,
  ).toBe(false);
  expect(storyLeafSchema.safeParse({ ...definition, version: 2 }).success).toBe(
    false,
  );
  const invalid = fixture();
  invalid.storyNodes.opening.leaf = definition;
  expect(() => validateStory(invalid)).toThrow("Only a StoryLeaf");
});

it("binds child consent to Story and edition without breaking no-import commands", () => {
  const base = {
    idempotencyKey: "child",
    expectedRevision: 1,
    payload: { branchId: "side" },
  };
  expect(branchCommandSchema.safeParse(base).success).toBe(true);
  expect(
    branchCommandSchema.safeParse({
      ...base,
      payload: { ...base.payload, importConsent: true },
    }).success,
  ).toBe(false);
  const payload = {
    ...base.payload,
    storyId: "child",
    versionId: "edition-1",
    importConsent: true,
    sourceRuns: [
      { sourceStoryId: "source", sourceVersionId: "edition-1", runId: "run" },
    ],
  };
  expect(branchCommandSchema.safeParse({ ...base, payload }).success).toBe(
    true,
  );
  for (const invalid of [
    { ...payload, storyId: undefined },
    { ...payload, versionId: undefined },
    { ...payload, importConsent: false },
    { ...payload, sourceRuns: [...payload.sourceRuns, ...payload.sourceRuns] },
  ])
    expect(
      branchCommandSchema.safeParse({ ...base, payload: invalid }).success,
    ).toBe(false);
});
