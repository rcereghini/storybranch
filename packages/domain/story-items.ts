import type { StagedBattleStory } from "../contracts/battle-graph";
import type { Story } from "../contracts/index";

export function itemReferences(story: StagedBattleStory) {
  const refs: {
    itemId: string;
    storyNodeId: string;
    location: string;
    path: string;
  }[] = [];
  for (const node of Object.values(story.storyNodes)) {
    const visit = (value: unknown, location: string, path: string) => {
      if (!value || typeof value !== "object") return;
      if ("itemId" in value && typeof value.itemId === "string")
        refs.push({
          itemId: value.itemId,
          storyNodeId: node.id,
          location: `${node.title} — ${location}`,
          path,
        });
      for (const [key, child] of Object.entries(value)) {
        const label: Record<string, string> = {
          costs: "cost",
          availableWhen: "condition",
          condition: "condition",
          effects: "item change",
          success: "pass",
          failure: "fail",
        };
        visit(
          child,
          label[key] ? `${location} / ${label[key]}` : location,
          `${path}.${key}`,
        );
      }
    };
    visit(node.entryEffects, "on entry", "entryEffects");
    if (node.storyNodeType === "battle")
      for (const [outcome, route] of Object.entries(node.outputs))
        visit(route, outcome, `outputs.${outcome}`);
    else
      node.choices.forEach((choice, i) =>
        visit(choice, choice.label, `choices.${i}`),
      );
  }
  return refs;
}

export function storyItems(story: StagedBattleStory) {
  const entries = story.itemCatalogue?.items ?? [];
  const ids = new Set([
    ...entries.map((i) => i.itemId),
    ...itemReferences(story)
      .map((r) => r.itemId)
      .filter((id) => id.startsWith(story.id + ":")),
  ]);
  return [...ids].sort().map((itemId) => {
    const entry = entries.find((i) => i.itemId === itemId);
    return {
      itemId,
      name: entry?.name ?? itemId,
      description: entry?.description ?? "",
      catalogued: !!entry,
    };
  });
}

export function itemLabel(story: Story, itemId: string) {
  const name = story.itemCatalogue?.items.find(
    (i) => i.itemId === itemId,
  )?.name;
  return name ? `${name} (${itemId})` : itemId;
}
