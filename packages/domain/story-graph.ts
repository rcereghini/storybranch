import type { Story as OrdinaryStory } from "../contracts/index";
import type { StagedBattleStory as Story } from "../contracts/battle-graph";
type StoryNode = Story["storyNodes"][string];
import type { StoryNodePositions } from "../contracts/authoring";

export type StoryNodeConnection = {
  choiceId: string;
  slot: number;
  label: string;
  target: string;
};
export function connections(storyNode: StoryNode): StoryNodeConnection[] {
  if (storyNode.storyNodeType === "battle")
    return (["win", "loss", "escape"] as const).map((outcome) => ({
      choiceId: outcome,
      slot: 0,
      label: outcome[0].toUpperCase() + outcome.slice(1),
      target: storyNode.outputs[outcome].targetStoryNodeId,
    }));
  return storyNode.choices.flatMap((c) => {
    const o = c.outcome;
    const base = { choiceId: c.id };
    if (o.kind === "direct")
      return [
        { ...base, slot: 0, label: c.label, target: o.route.targetStoryNodeId },
      ];
    if (o.kind === "reveal")
      return o.results.map((r, slot) => ({
        ...base,
        slot,
        label: r.scoreId.split(":").at(-1) ?? c.label,
        target: r.route.targetStoryNodeId,
      }));
    return [
      {
        ...base,
        slot: 0,
        label: `${c.label} · Pass`,
        target: o.success.targetStoryNodeId,
      },
      {
        ...base,
        slot: 1,
        label: `${c.label} · Fail`,
        target: o.failure.targetStoryNodeId,
      },
    ];
  });
}
export function connectStoryNode(
  story: OrdinaryStory,
  source: string,
  edge: Pick<StoryNodeConnection, "choiceId" | "slot">,
  target: string,
): OrdinaryStory;
export function connectStoryNode(
  story: Story,
  source: string,
  edge: Pick<StoryNodeConnection, "choiceId" | "slot">,
  target: string,
): Story;
export function connectStoryNode(
  story: Story,
  source: string,
  edge: Pick<StoryNodeConnection, "choiceId" | "slot">,
  target: string,
): Story {
  const storyNode = story.storyNodes[source];
  if (!storyNode || !story.storyNodes[target])
    throw new Error("Choose an existing destination StoryNode.");
  if (storyNode.storyNodeType === "battle") {
    const outcome = (["win", "loss", "escape"] as const).find(
      (key) => key === edge.choiceId,
    );
    if (!outcome || edge.slot !== 0)
      throw new Error("This output no longer exists.");
    return {
      ...story,
      storyNodes: {
        ...story.storyNodes,
        [source]: {
          ...storyNode,
          outputs: {
            ...storyNode.outputs,
            [outcome]: {
              ...storyNode.outputs[outcome],
              targetStoryNodeId: target,
            },
          },
        },
      },
    };
  }
  const c = storyNode.choices.find((c) => c.id === edge.choiceId);
  if (
    !c ||
    !connections(storyNode).some(
      (e) => e.choiceId === edge.choiceId && e.slot === edge.slot,
    )
  )
    throw new Error("This output no longer exists.");
  if (c.outcome.kind === "reveal" && story.storyNodes[target].kind !== "ending")
    throw new Error("Quiz results must connect to an ending.");
  const choices = storyNode.choices.map((c) => {
    if (c.id !== edge.choiceId) return c;
    const o = c.outcome;
    if (o.kind === "direct")
      return {
        ...c,
        outcome: { ...o, route: { ...o.route, targetStoryNodeId: target } },
      };
    if (o.kind === "reveal")
      return {
        ...c,
        outcome: {
          ...o,
          results: o.results.map((r, i) =>
            i === edge.slot
              ? { ...r, route: { ...r.route, targetStoryNodeId: target } }
              : r,
          ),
        },
      };
    const key = edge.slot === 0 ? "success" : "failure";
    return {
      ...c,
      outcome: { ...o, [key]: { ...o[key], targetStoryNodeId: target } },
    };
  });
  return {
    ...story,
    storyNodes: { ...story.storyNodes, [source]: { ...storyNode, choices } },
  };
}
export const graphCardHeight = (storyNode: StoryNode) =>
  116 + Math.max(1, connections(storyNode).length) * 34;
// Breadth-first columns keep shared destinations and cycles finite; disconnected
// StoryNodes occupy a separate final column until the creator connects them.
export function arrangeStoryNodes(story: Story): StoryNodePositions {
  const depth = new Map<string, number>();
  const queue = [story.entryStoryNodeId];
  depth.set(story.entryStoryNodeId, 0);
  for (let i = 0; i < queue.length; i++) {
    const storyNode = story.storyNodes[queue[i]];
    if (!storyNode) continue;
    for (const edge of connections(storyNode))
      if (story.storyNodes[edge.target] && !depth.has(edge.target)) {
        depth.set(edge.target, depth.get(storyNode.id)! + 1);
        queue.push(edge.target);
      }
  }
  const endingColumn =
    Math.max(
      0,
      ...Object.values(story.storyNodes)
        .filter((p) => p.kind !== "ending")
        .map((p) => depth.get(p.id) ?? 0),
    ) + 1;
  for (const storyNode of Object.values(story.storyNodes))
    if (
      storyNode.kind === "ending" &&
      depth.has(storyNode.id) &&
      storyNode.id !== story.entryStoryNodeId
    )
      depth.set(storyNode.id, endingColumn);
  const last = Math.max(0, ...depth.values()) + 1;
  const lanes = new Map<number, number>();
  return Object.fromEntries(
    Object.values(story.storyNodes).map((storyNode) => {
      let column = depth.get(storyNode.id) ?? last;
      while ((lanes.get(column) ?? 40) > 48000) column++;
      const y = lanes.get(column) ?? 40;
      lanes.set(column, y + graphCardHeight(storyNode) + 64);
      return [storyNode.id, { x: 40 + column * 350, y }];
    }),
  );
}
