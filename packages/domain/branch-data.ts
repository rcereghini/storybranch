import {
  GameError,
  type Save,
  type StoryNode,
  type Choice,
} from "../contracts/index";
import {
  inputType,
  nodeInputSnapshotSchema,
  type InputBindings,
  type InputValue,
} from "../contracts/branch-data";

export function inputBindingIssue(
  destination: StoryNode,
  bindings?: InputBindings,
  dice = false,
): string | undefined {
  const fields = destination.inputs?.fields ?? [];
  for (const binding of bindings?.bindings ?? []) {
    const field = fields.find((f) => f.name === binding.input);
    if (!field) return `Unknown destination input: ${binding.input}.`;
    const source = binding.source;
    if (source.kind === "dice" && !dice)
      return "Dice input requires the current Dice outcome.";
    const type =
      source.kind === "constant"
        ? inputType(source.value)
        : source.field === "passed"
          ? "boolean"
          : "integer";
    if (field.type !== type) return `Incompatible input type: ${field.name}.`;
  }
  const missing = fields.find(
    (f) =>
      f.required &&
      f.default === undefined &&
      !bindings?.bindings.some((b) => b.input === f.name),
  );
  if (missing) return `Required input has no source: ${missing.name}.`;
}

export function resolveNodeInputs(
  destination: StoryNode,
  revision: number,
  bindings?: InputBindings,
  roll?: Save["lastRoll"],
): Save["nodeInputs"] {
  const issue = inputBindingIssue(destination, bindings, !!roll);
  if (issue) throw new GameError("VALIDATION_FAILED", issue);
  if (!destination.inputs) return undefined;
  const values: Record<string, InputValue> = {};
  for (const field of destination.inputs.fields)
    if (field.default !== undefined) values[field.name] = field.default;
  for (const binding of bindings?.bindings ?? []) {
    const source = binding.source;
    values[binding.input] =
      source.kind === "constant" ? source.value : roll![source.field];
  }
  return nodeInputSnapshotSchema.parse({
    version: 1,
    storyNodeId: destination.id,
    revision,
    values,
  });
}

export function choiceInputIssue(
  choice: Choice,
  nodes: Record<string, StoryNode>,
): string | undefined {
  const outcome = choice.outcome;
  const routes =
    outcome.kind === "direct"
      ? [outcome.route]
      : outcome.kind === "reveal"
        ? outcome.results.map((r) => r.route)
        : [outcome.success, outcome.failure];
  for (const route of routes) {
    const destination = nodes[route.targetStoryNodeId];
    if (!destination) return "Dangling route";
    const issue = inputBindingIssue(
      destination,
      route.inputBindings,
      outcome.kind === "dice",
    );
    if (issue) return issue;
  }
}
