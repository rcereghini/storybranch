import { GameError, type StoryNode } from "../contracts/index";
import {
  battleOutputsSchema,
  type BattleOutputs,
} from "../contracts/battle-routing";
import type { InputBindings } from "../contracts/branch-data";
import { battleScopeSchema, type BattleResult } from "../contracts/battle";
import { actBattle, battleResultValue } from "./battle";
import { validatePublication } from "./authoring";
import { inputBindingIssue, resolveNodeInputs } from "./branch-data";

function constantBindings(
  route: BattleOutputs["win"],
  result?: BattleResult,
): InputBindings | undefined {
  if (!route.inputBindings) return undefined;
  return {
    version: 1,
    bindings: route.inputBindings.bindings.map((b) => ({
      input: b.input,
      source: {
        kind: "constant",
        value:
          b.source.kind === "constant"
            ? b.source.value
            : result
              ? battleResultValue(result, b.source.field)
              : b.source.field === "won"
                ? false
                : 0,
      },
    })),
  };
}
function checkRoutes(outputs: BattleOutputs, nodes: Record<string, StoryNode>) {
  for (const [outcome, route] of Object.entries(outputs)) {
    const target = nodes[route.targetStoryNodeId];
    if (!target)
      throw new GameError(
        "VALIDATION_FAILED",
        `${outcome}: destination is missing or unsafe.`,
      );
    const issue = inputBindingIssue(target, constantBindings(route));
    if (issue) throw new GameError("VALIDATION_FAILED", `${outcome}: ${issue}`);
    // Same conservative restriction as guaranteed paths in reviewPublication.
    if (route.effects.some((e) => e.kind === "item" && e.delta !== 0))
      throw new GameError(
        "VALIDATION_FAILED",
        `${outcome}: item effects require bounded inventory analysis.`,
      );
  }
}
export function validateBattleOutputs(
  storyInput: unknown,
  outputsInput: unknown,
) {
  const story = validatePublication(storyInput);
  const outputs = battleOutputsSchema.parse(outputsInput);
  checkRoutes(outputs, story.storyNodes);
  return { story, outputs };
}

// Pure proposal only. Caller loads owned state and later commits route/effects/entry atomically.
export function continueBattle(
  storyInput: unknown,
  outputsInput: unknown,
  configInput: unknown,
  stateInput: unknown,
  healthInput: unknown,
  scopeInput: unknown,
  intentInput: unknown,
) {
  const pending = actBattle(
    configInput,
    stateInput,
    healthInput,
    scopeInput,
    intentInput,
  );
  if (pending.kind !== "continue")
    throw new GameError(
      "VALIDATION_FAILED",
      "Battle routing requires explicit Continue.",
    );
  const { story, outputs } = validateBattleOutputs(storyInput, outputsInput);
  // Cross-bind the routing graph to the same pinned edition as the encounter.
  const scope = battleScopeSchema.parse(scopeInput);
  if (
    story.id !== scope.identity.storyId ||
    story.versionId !== scope.identity.versionId
  )
    throw new GameError(
      "VALIDATION_FAILED",
      "Battle routing edition mismatch.",
    );
  const route = outputs[pending.result.outcome];
  const destination = story.storyNodes[route.targetStoryNodeId];
  const revision = scope.revision + 1;
  return {
    outcome: pending.result.outcome,
    destination,
    effects: route.effects,
    nodeInputs: resolveNodeInputs(
      destination,
      revision,
      constantBindings(route, pending.result),
    ),
    revision,
  };
}
