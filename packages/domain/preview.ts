import {
  GameError,
  type Story,
  type Save,
  type Condition,
} from "../contracts/index";
import {
  previewScenarioSchema,
  type PreviewScenario,
} from "../contracts/preview";
import { start, baseStats, evaluate } from "./index";
import { renderStoryNode } from "./player";

export function previewPreset(
  story: Story,
  preset: "first" | "returning" | "sequel",
): PreviewScenario {
  return {
    version: 1,
    accountKeys: [],
    storyKeys:
      preset === "returning"
        ? (story.progression?.keys ?? []).map((k) => k.keyId)
        : [],
    importedKeys:
      preset === "sequel"
        ? (story.keyImports?.keys ?? []).map((k) => k.keyId)
        : [],
  };
}

export function startPreview(
  story: Story,
  input: PreviewScenario,
  now: number,
): Save {
  const scenario = previewScenarioSchema.parse(input);
  if (
    scenario.accountKeys.some(
      (id) => !story.accountKeys?.keys.some((k) => k.keyId === id),
    ) ||
    scenario.storyKeys.some(
      (id) => !story.progression?.keys.some((k) => k.keyId === id),
    ) ||
    scenario.importedKeys.some(
      (id) => !story.keyImports?.keys.some((k) => k.keyId === id),
    )
  )
    throw new GameError(
      "VALIDATION_FAILED",
      "Preview keys must be declared by this Story.",
    );
  return start(
    story,
    "preview",
    "preview",
    baseStats,
    now,
    undefined,
    { version: 1, keys: [...scenario.storyKeys] },
    {
      version: 1,
      consented: false,
      at: now,
      keys: (story.keyImports?.keys ?? []).map((k) => ({
        keyId: k.keyId,
        present: scenario.importedKeys.includes(k.keyId),
        sourceStoryId: k.sourceStoryId,
        sourceVersionId: k.sourceVersionId,
        sourceKeyId: k.sourceKeyId,
      })),
    },
  );
}

function describe(c: Condition): string {
  switch (c.kind) {
    case "key":
      return `${c.scope ?? "run"} key ${c.keyId} must be ${c.present ? "present" : "absent"}`;
    case "stat":
      return `${c.stat} ${c.op} ${c.value}`;
    case "item":
      return `${c.itemId} quantity ${c.op} ${c.quantity}`;
    case "roll":
      return `roll at ${c.storyNodeId} ${c.op} ${c.value}`;
    case "all":
    case "any":
      return `${c.kind} of (${c.conditions.map(describe).join("; ")})`;
    case "not":
      return `not (${describe(c.condition)})`;
  }
}

// Creator-only explanations; never attach to a player projection.
export function previewOptions(
  story: Story,
  save: Save,
  accountKeys: readonly string[] = [],
) {
  const node = story.storyNodes[save.storyNodeId];
  const outputs = renderStoryNode(node, save, accountKeys).outputs;
  return node.choices.map((choice) => {
    const output = outputs.find((o) => o.id === choice.id);
    const costs = new Map<string, number>();
    choice.costs.forEach((c) =>
      costs.set(c.itemId, (costs.get(c.itemId) ?? 0) + c.quantity),
    );
    return {
      id: choice.id,
      label: choice.label,
      status: !output ? "Hidden" : output.enabled ? "Visible" : "Locked",
      reason: [
        choice.availableWhen
          ? `${evaluate(choice.availableWhen, save, accountKeys) ? "Condition met" : "Condition not met"}: ${describe(choice.availableWhen)}.`
          : "No condition.",
        ...[...costs].map(
          ([id, quantity]) =>
            `Cost ${id}: need ${quantity}, have ${save.items[id] ?? 0}.`,
        ),
        ...(!costs.size ? ["No item cost."] : []),
      ].join(" "),
    };
  });
}
