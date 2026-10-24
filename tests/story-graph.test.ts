import { it, expect } from "vitest";
import {
  arrangeStoryNodes,
  connectStoryNode,
  connections,
} from "../packages/domain/story-graph";
import { storyNodeStories } from "../fixtures/story-node-stories";
import { draftSchema } from "../packages/contracts/authoring";

it("reconnects an output without losing effects or changing other routes", () => {
  const story = structuredClone(
    storyNodeStories.find((s) =>
      Object.values(s.storyNodes).some((p) => p.storyNodeType === "dice"),
    )!,
  );
  const storyNode = Object.values(story.storyNodes).find(
    (p) => p.storyNodeType === "dice",
  )!;
  const edges = connections(storyNode);
  const before = structuredClone(storyNode.choices[0]);
  const updated = connectStoryNode(
    story,
    storyNode.id,
    edges[0],
    edges[1].target,
  );
  expect(connections(updated.storyNodes[storyNode.id])[0].target).toBe(
    edges[1].target,
  );
  expect(updated.storyNodes[storyNode.id].choices[0].outcome).toMatchObject({
    failure: before.outcome.kind === "dice" ? before.outcome.failure : {},
  });
  expect(storyNode.choices[0]).toEqual(before);
  expect(() =>
    connectStoryNode(story, storyNode.id, edges[0], "missing"),
  ).toThrow();
});
it("arranges branches and cycles without duplicates or infinite traversal", () => {
  const story = structuredClone(storyNodeStories[0]);
  const entry = story.storyNodes[story.entryStoryNodeId];
  const loop = connectStoryNode(
    story,
    entry.id,
    connections(entry)[0],
    entry.id,
  );
  const positions = arrangeStoryNodes(loop);
  expect(Object.keys(positions).sort()).toEqual(
    Object.keys(story.storyNodes).sort(),
  );
  expect(
    new Set(Object.values(positions).map((p) => `${p.x}:${p.y}`)).size,
  ).toBe(Object.keys(story.storyNodes).length);
  expect(positions[entry.id].x).toBe(40);
});
it("stores bounded editor positions separately from the published story graph", () => {
  const story = storyNodeStories[0];
  const draft = {
    story,
    description: "",
    storyNodePositions: arrangeStoryNodes(story),
  };
  expect(draftSchema.parse(draft).storyNodePositions).toEqual(
    draft.storyNodePositions,
  );
  expect(
    draftSchema.safeParse({
      ...draft,
      storyNodePositions: { x: { x: Infinity, y: 0 } },
    }).success,
  ).toBe(false);
  expect(
    draftSchema.safeParse({
      ...draft,
      storyNodePositions: { x: { x: -1, y: 0 } },
    }).success,
  ).toBe(false);
  expect(story).not.toHaveProperty("storyNodePositions");
});
