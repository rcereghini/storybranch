import { expect, it } from "vitest";
import { completionSchema, storyLeafSchema } from "../packages/contracts/index";
import {
  start,
  transition,
  baseStats,
  validateStory,
} from "../packages/domain/index";
import { validatePublication } from "../packages/domain/authoring";
import { playerRun, renderStoryNode } from "../packages/domain/player";
import { starterStory } from "../apps/web/src/studio-model";

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
