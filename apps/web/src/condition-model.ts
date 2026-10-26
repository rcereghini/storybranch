import {
  conditionSchema,
  type Condition,
  type Story,
} from "../../../packages/contracts/index";
export type ConditionKey = {
  value: string;
  keyId: string;
  scope: "run" | "story" | "import" | "account";
  label: string;
};
export function conditionKeys(story: Story): ConditionKey[] {
  const run = new Set(story.trunkContext?.initialKeys ?? []);
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    if (
      "keyId" in value &&
      typeof value.keyId === "string" &&
      (!("scope" in value) || value.scope === "run")
    )
      run.add(value.keyId);
    for (const child of Object.values(value)) visit(child);
  };
  visit(story.storyNodes);
  return [
    ...[...run].map((keyId) => ({
      keyId,
      label: keyId,
      scope: "run" as const,
    })),
    ...(story.progression?.keys ?? []).map((k) => ({
      ...k,
      scope: "story" as const,
    })),
    ...(story.keyImports?.keys ?? []).map((k) => ({
      ...k,
      scope: "import" as const,
    })),
    ...(story.accountKeys?.keys ?? []).map((k) => ({
      ...k,
      scope: "account" as const,
    })),
  ].map((k) => ({
    keyId: k.keyId,
    scope: k.scope,
    label: `${k.label} (${k.scope})`,
    value: `${k.scope}|${k.keyId}`,
  }));
}
export function isEditableCondition(c: Condition | undefined): boolean {
  if (!c || c.kind === "key" || c.kind === "stat" || c.kind === "item")
    return true;
  if (c.kind === "not") return isEditableCondition(c.condition);
  if (c.kind === "all" || c.kind === "any")
    return c.conditions.every(isEditableCondition);
  return false;
}
export function validateCondition(
  input: Condition | undefined,
  story: Story,
): Condition | undefined {
  if (!input) return undefined;
  const parsed = conditionSchema.parse(input);
  if (!isEditableCondition(parsed))
    throw new Error("Use advanced JSON for roll conditions.");
  const keys = conditionKeys(story);
  const check = (c: Condition) => {
    if (c.kind === "key") {
      if (
        !(c.scope ?? "run").match(/^(run|story|import|account)$/) ||
        !c.keyId.startsWith(`${story.id}:`)
      )
        throw new Error("Choose a key in this Story's namespace.");
      if (
        c.scope &&
        c.scope !== "run" &&
        !keys.some((k) => k.scope === c.scope && k.keyId === c.keyId)
      )
        throw new Error(
          "Choose a declared Story key or imported/account alias.",
        );
    } else if (c.kind === "item") {
      if (!c.itemId.startsWith(`${story.id}:`))
        throw new Error("Choose an item in this Story's namespace.");
    } else if (c.kind === "not") check(c.condition);
    else if (c.kind === "all" || c.kind === "any") c.conditions.forEach(check);
  };
  check(parsed);
  return parsed;
}
