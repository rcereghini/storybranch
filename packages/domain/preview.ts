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
import { start, baseStats, evaluate, routesOf } from "./index";
import { renderStoryNode } from "./player";

export function previewItemIds(story: Story): string[] {
  const ids = new Set<string>();
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    if (
      "itemId" in value &&
      typeof value.itemId === "string" &&
      value.itemId.startsWith(story.id + ":")
    )
      ids.add(value.itemId);
    Object.values(value).forEach(visit);
  };
  visit(story.storyNodes);
  return [...ids].sort();
}

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
  const items = previewItemIds(story);
  if (Object.keys(scenario.items ?? {}).some((id) => !items.includes(id)))
    throw new GameError(
      "VALIDATION_FAILED",
      "Preview items must be referenced by this Story.",
    );
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
    scenario.stats ?? baseStats,
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
    scenario.items,
  );
}

const comparisonWords = { gte: "at least", lte: "at most", eq: "exactly" };
export function describeCondition(c: Condition): string {
  switch (c.kind) {
    case "key":
      return `${c.scope ?? "run"} key ${c.keyId} must be ${c.present ? "present" : "absent"}`;
    case "stat":
      return `${c.stat} ${comparisonWords[c.op]} ${c.value}`;
    case "item":
      return `${c.itemId} quantity ${comparisonWords[c.op]} ${c.quantity}`;
    case "roll":
      return `roll at ${c.storyNodeId} ${comparisonWords[c.op]} ${c.value}`;
    case "all":
    case "any":
      return `${c.kind} of (${c.conditions.map(describeCondition).join("; ")})`;
    case "not":
      return `not (${describeCondition(c.condition)})`;
  }
}

export type ConditionDiagnostic = {
  path: string;
  met: boolean;
  description: string;
  actual?: string;
};
// Evaluate every child for explanation, even when All/Any could short-circuit.
// Only disposable creator preview state may be passed to this diagnostic surface.
export function explainCondition(
  c: Condition,
  save: Save,
  accountKeys: readonly string[] = [],
  path = "1",
): ConditionDiagnostic[] {
  let actual: string | undefined;
  if (c.kind === "stat")
    actual = "Current " + c.stat + ": " + save.stats[c.stat];
  if (c.kind === "item")
    actual = "Current quantity: " + (save.items[c.itemId] ?? 0);
  if (c.kind === "key")
    actual =
      "Currently " +
      (evaluate({ ...c, present: true }, save, accountKeys)
        ? "present"
        : "absent");
  if (c.kind === "roll")
    actual =
      save.lastRoll?.storyNodeId === c.storyNodeId
        ? "Last roll: " + save.lastRoll.value
        : "No matching last roll";
  const children =
    c.kind === "not"
      ? [c.condition]
      : c.kind === "all" || c.kind === "any"
        ? c.conditions
        : [];
  return [
    {
      path,
      met: evaluate(c, save, accountKeys),
      description:
        c.kind === "all"
          ? "All of the following checks"
          : c.kind === "any"
            ? "Any of the following checks"
            : c.kind === "not"
              ? "Invert the following check"
              : describeCondition(c),
      ...(actual ? { actual } : {}),
    },
    ...children.flatMap((child, i) =>
      explainCondition(child, save, accountKeys, path + "." + (i + 1)),
    ),
  ];
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
      checks: choice.availableWhen
        ? explainCondition(choice.availableWhen, save, accountKeys)
        : [],
      reason: [
        choice.availableWhen
          ? `${evaluate(choice.availableWhen, save, accountKeys) ? "Condition met" : "Condition not met"}: ${describeCondition(choice.availableWhen)}.`
          : "No condition.",
        ...[...costs].map(
          ([id, quantity]) =>
            `Cost ${id}: need ${quantity}, have ${save.items[id] ?? 0}.`,
        ),
        ...(!costs.size ? ["No item cost."] : []),
        ...routesOf(choice).flatMap((route, index) => {
          const label =
            choice.outcome.kind === "direct"
              ? "Selected route"
              : choice.outcome.kind === "reveal"
                ? `Result ${choice.outcome.results[index].scoreId}`
                : index === 0
                  ? "Pass"
                  : "Fail";
          return route.effects.flatMap((effect) =>
            effect.kind === "item"
              ? [
                  `${label}: ${effect.delta >= 0 ? "grant" : "remove"} ${Math.abs(effect.delta)} ${effect.itemId} if this route is taken. Inventory must remain within 0–999; destination entry effects still apply.`,
                ]
              : [],
          );
        }),
      ].join(" "),
    };
  });
}
