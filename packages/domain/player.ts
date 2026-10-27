import {
  completionSchema,
  type Save,
  type StoryNode,
  type Story,
} from "../contracts/index";
import {
  renderStoryNodeSchema,
  playerRollSchema,
  type PlayerRun,
  playerItemSchema,
  playerItemChangeSchema,
} from "../contracts/player";
import { evaluate } from "./index";

function itemDisplay(story: Pick<Story, "itemCatalogue">, itemId: string) {
  const definition = story.itemCatalogue?.items.find(
    (i) => i.itemId === itemId,
  );
  return {
    itemId,
    name: definition?.name ?? itemId,
    description: definition?.description ?? "",
  };
}

export function playerInventory(
  story: Pick<Story, "itemCatalogue">,
  items: Save["items"],
) {
  return Object.keys(items)
    .sort()
    .filter((id) => items[id] > 0)
    .map((id) =>
      playerItemSchema.parse({
        ...itemDisplay(story, id),
        quantity: items[id],
      }),
    );
}

// Only committed before/after state supplies these facts, never client intent.
export function playerItemChanges(
  story: Pick<Story, "itemCatalogue">,
  before: Save["items"],
  after: Save["items"],
) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .sort()
    .flatMap((id) => {
      const delta = (after[id] ?? 0) - (before[id] ?? 0);
      return delta === 0
        ? []
        : [playerItemChangeSchema.parse({ ...itemDisplay(story, id), delta })];
    });
}

// Explicit allowlist: authored routes, scoring and entry effects stay server-side.
// Studio uses this same adapter with its disposable, local preview save.
export function renderStoryNode(
  node: StoryNode,
  save: Save,
  accountKeys: readonly string[] = [],
  itemCatalogue?: Story["itemCatalogue"],
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
    const itemCosts = [...required]
      .filter(([, quantity]) => quantity > 0)
      .map(([itemId, quantity]) => ({
        itemId,
        name:
          itemCatalogue?.items.find((item) => item.itemId === itemId)?.name ??
          itemId,
        required: quantity,
        owned: save.items[itemId] ?? 0,
      }));
    return [
      {
        id: choice.id,
        label: choice.label,
        hint: choice.hint,
        enabled,
        ...(itemCosts.length ? { itemCosts } : {}),
      },
    ];
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
