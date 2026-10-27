import { GameError } from "../contracts/index";
import {
  stagedBattleStorySchema,
  type StagedBattleStory,
} from "../contracts/battle-graph";
import {
  battleCommandSchema,
  type BattleSave,
} from "../contracts/battle-player";
import { actBattle, startBattle, battleResultValue } from "./battle";
import { applyEffects, enter } from "./index";
import { resolveNodeInputs } from "./branch-data";

// Called only after authoritative destination entry effects have been applied.
export function initializeBattle(
  story: StagedBattleStory,
  save: BattleSave,
): BattleSave {
  const node = story.storyNodes[save.storyNodeId];
  if (node?.storyNodeType !== "battle") {
    delete save.battle;
    return save;
  }
  const started = startBattle(
    node.battle,
    {
      runId: save.id,
      storyId: save.storyId,
      versionId: save.versionId,
      storyNodeId: save.storyNodeId,
      entryRevision: save.revision,
    },
    save.health,
    save.stats,
    save.nodeInputs?.values ?? {},
  );
  save.battle = started.state;
  return save;
}
export function advanceBattle(
  storyInput: unknown,
  input: BattleSave,
  commandInput: unknown,
  now: number,
) {
  const story = stagedBattleStorySchema.parse(storyInput),
    command = battleCommandSchema.parse(commandInput);
  if (input.storyId !== story.id || input.versionId !== story.versionId)
    throw new GameError("VALIDATION_FAILED", "Battle edition mismatch.");
  if (input.revision !== command.expectedRevision)
    throw new GameError(
      "STALE_REVISION",
      "Reload the current battle before acting.",
    );
  if (input.status !== "active")
    throw new GameError("VALIDATION_FAILED", "This run is completed.");
  const node = story.storyNodes[input.storyNodeId];
  if (node?.storyNodeType !== "battle" || !input.battle)
    throw new GameError(
      "VALIDATION_FAILED",
      "No persisted battle at this location.",
    );
  const identity = {
    ...input.battle.identity,
    runId: input.id,
    storyId: input.storyId,
    versionId: input.versionId,
    storyNodeId: input.storyNodeId,
  };
  const moved = actBattle(
    node.battle,
    input.battle,
    input.health,
    {
      identity,
      revision: input.revision,
      expectedRevision: command.expectedRevision,
    },
    command.payload,
  );
  const save: BattleSave = structuredClone(input);
  save.revision++;
  save.updatedAt = now;
  if (moved.kind === "update") {
    save.health = moved.health;
    save.battle = moved.state;
  } else {
    const route = node.outputs[moved.result.outcome],
      target = story.storyNodes[route.targetStoryNodeId];
    if (!target)
      throw new GameError(
        "VALIDATION_FAILED",
        "Battle destination is unavailable.",
      );
    const bindings = route.inputBindings
      ? {
          version: 1 as const,
          bindings: route.inputBindings.bindings.map((b) => ({
            input: b.input,
            source: {
              kind: "constant" as const,
              value:
                b.source.kind === "constant"
                  ? b.source.value
                  : battleResultValue(moved.result, b.source.field),
            },
          })),
        }
      : undefined;
    const resolved = resolveNodeInputs(target, save.revision, bindings);
    if (resolved) save.nodeInputs = resolved;
    else delete save.nodeInputs;
    applyEffects(save, route.effects);
    save.storyNodeId = target.id;
    delete save.battle;
    delete save.lastRoll;
    enter(save, story);
    initializeBattle(story, save);
  }
  return {
    save,
    event: {
      label:
        command.payload.action === "continue"
          ? "Continued after battle"
          : `Battle ${command.payload.action}`,
      from: input.storyNodeId,
      to: save.storyNodeId,
      revision: save.revision,
      at: now,
    },
  };
}
