import {
  completionSchema,
  type Save,
  type StoryNode,
} from "../contracts/index";
import {
  renderStoryNodeSchema,
  playerRollSchema,
  type PlayerRun,
} from "../contracts/player";
import { evaluate } from "./index";

// Explicit allowlist: authored routes, scoring and entry effects stay server-side.
// Studio uses this same adapter with its disposable, local preview save.
export function renderStoryNode(
  node: StoryNode,
  save: Save,
  accountKeys: readonly string[] = [],
) {
  const outputs = node.choices.flatMap((choice) => {
    const required = new Map<string, number>();
    for (const cost of choice.costs)
      required.set(
        cost.itemId,
        (required.get(cost.itemId) ?? 0) + cost.quantity,
      );
    const enabled =
      (!choice.availableWhen ||
        evaluate(choice.availableWhen, save, accountKeys)) &&
      [...required].every(
        ([item, quantity]) => (save.items[item] ?? 0) >= quantity,
      );
    if (!enabled && choice.unavailableDisplay === "hidden") return [];
    return [{ id: choice.id, label: choice.label, hint: choice.hint, enabled }];
  });
  return renderStoryNodeSchema.parse({
    id: node.id,
    title: node.title,
    transcript: node.transcript,
    kind: node.kind,
    storyNodeType: node.storyNodeType,
    video: node.video,
    videoAdvance: node.videoAdvance,
    comic: node.comic,
    outputs,
    diceSides:
      node.choices[0]?.outcome.kind === "dice"
        ? node.choices[0].outcome.sides
        : undefined,
  });
}
export function playerRun(save: Save): PlayerRun {
  return {
    id: save.id,
    playerUid: save.playerUid,
    storyId: save.storyId,
    versionId: save.versionId,
    rulesetVersion: save.rulesetVersion,
    storyNodeId: save.storyNodeId,
    revision: save.revision,
    status: save.status,
    stats: save.stats,
    statsSnapshot: save.statsSnapshot,
    keys: save.keys,
    items: save.items,
    health: save.health,
    milestones: save.milestones,
    parentPlaythroughId: save.parentPlaythroughId,
    parentRevision: save.parentRevision,
    updatedAt: save.updatedAt,
    ...(save.completion
      ? { completion: completionSchema.parse(save.completion) }
      : {}),
    ...(save.lastRoll
      ? { lastRoll: playerRollSchema.parse(save.lastRoll) }
      : {}),
  };
}
