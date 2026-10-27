import { battleStateSchema, battleHealthSchema } from "../contracts/battle";
import type { BattleSave } from "../contracts/battle-player";
import type { StagedBattleNode } from "../contracts/battle-graph";
import { renderStoryNodeSchema } from "../contracts/player";
import { validateBattleState } from "./battle";

export function renderBattleNode(node: StagedBattleNode, save: BattleSave) {
  const state = battleStateSchema.parse(save.battle);
  if (
    !Number.isSafeInteger(save.revision) ||
    save.revision < state.identity.entryRevision + state.turns
  )
    throw Error("Invalid battle revision.");
  validateBattleState(
    node.battle,
    state,
    battleHealthSchema.parse(save.health),
    {
      ...state.identity,
      runId: save.id,
      storyId: save.storyId,
      versionId: save.versionId,
      storyNodeId: save.storyNodeId,
    },
  );
  return renderStoryNodeSchema.parse({
    id: node.id,
    title: node.title,
    transcript: node.transcript,
    kind: node.kind,
    storyNodeType: "battle",
    outputs: [],
    battle: {
      version: 1,
      battleId: state.battleId,
      phase: state.phase,
      turns: state.turns,
      maxTurns: node.battle.maxTurns,
      initiative: state.initiative,
      playerHealth: save.health,
      playerMaxHealth: 100,
      enemy: {
        name: node.battle.enemy.name,
        health: state.enemyHealth,
        maxHealth: node.battle.enemy.maxHealth,
      },
      actions:
        state.phase === "active" ? ["attack", "guard", "escape"] : ["continue"],
      ...(state.phase === "result-pending" ? { result: state.result } : {}),
    },
  });
}
