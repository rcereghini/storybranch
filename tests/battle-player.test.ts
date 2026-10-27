import { expect, it } from "vitest";
import { starterStory } from "../apps/web/src/studio-model";
import { stagedBattleStorySchema } from "../packages/contracts/battle-graph";
import { type BattleSave } from "../packages/contracts/battle-player";
import { start } from "../packages/domain/index";
import {
  initializeBattle,
  advanceBattle,
} from "../packages/domain/battle-player";
function fixture() {
  const base = starterStory("battle-persistence");
  const battle = {
    id: "opening",
    title: "Fight",
    transcript: "Fight",
    kind: "scene",
    storyNodeType: "battle",
    entryEffects: [],
    battle: {
      version: 1,
      rules: "battle-1",
      enemy: { name: "Guard", maxHealth: 1, attack: 1, defense: 0, agility: 1 },
      maxTurns: 10,
    },
    outputs: Object.fromEntries(
      ["win", "loss", "escape"].map((x) => [
        x,
        { targetStoryNodeId: "ending", effects: [] },
      ]),
    ),
  };
  const story = stagedBattleStorySchema.parse({
    ...base,
    storyNodes: { ...base.storyNodes, opening: battle },
  });
  const save = initializeBattle(
    story,
    start(
      base,
      "run",
      "player",
      { strength: 8, agility: 8, resolve: 8, intellect: 8, charisma: 8 },
      1,
    ),
  );
  return { story, save };
}
function command(save: BattleSave, action: string) {
  return {
    idempotencyKey: "command",
    expectedRevision: save.revision,
    payload: {
      battleId: save.battle!.battleId,
      expectedTurn: save.battle!.turns,
      action,
    },
  };
}
it("initializes chained battles after route and entry effects using result bindings", () => {
  const { story, save } = fixture();
  const first = story.storyNodes.opening;
  if (first.storyNodeType !== "battle") throw Error();
  const second = structuredClone(first);
  second.id = "second";
  second.inputs = {
    version: 1,
    fields: [{ name: "bonus", type: "integer", required: true, default: 0 }],
  };
  second.battle.inputs = { attackBonus: "bonus" };
  second.entryEffects = [
    { id: "second-strength", kind: "stat", stat: "strength", delta: 2 },
  ];
  story.storyNodes.second = second;
  first.outputs.win = {
    targetStoryNodeId: "second",
    effects: [{ id: "route-health", kind: "health", delta: -10 }],
    inputBindings: {
      version: 1,
      bindings: [
        { input: "bonus", source: { kind: "battle", field: "turns" } },
      ],
    },
  };
  const pending = advanceBattle(story, save, command(save, "attack"), 2).save;
  const next = advanceBattle(
    story,
    pending,
    command(pending, "continue"),
    3,
  ).save;
  expect(next.storyNodeId).toBe("second");
  expect(next.health).toBe(90);
  expect(next.stats.strength).toBe(10);
  expect(next.battle!.playerAttack).toBe(8);
  expect(next.nodeInputs?.values).toEqual({ bonus: 1 });
  expect(next.battle!.identity.entryRevision).toBe(2);
  expect(next.battle!.battleId).not.toBe(save.battle!.battleId);
  expect(save.revision).toBe(0);
  expect(() =>
    advanceBattle(
      story,
      next,
      { ...command(next, "attack"), payload: command(save, "attack").payload },
      4,
    ),
  ).toThrow();
});
it("keeps the pending result intact if destination inputs cannot resolve", () => {
  const { story, save } = fixture();
  story.storyNodes.ending.inputs = {
    version: 1,
    fields: [{ name: "missing", type: "integer", required: true }],
  };
  const pending = advanceBattle(story, save, command(save, "attack"), 2).save;
  const before = structuredClone(pending);
  expect(() =>
    advanceBattle(story, pending, command(pending, "continue"), 3),
  ).toThrow();
  expect(pending).toEqual(before);
});
it("persists zero-health loss and grants local leaf rewards only on Continue", () => {
  const { story, save } = fixture();
  save.health = 0;
  initializeBattle(story, save);
  if (story.storyNodes.ending.storyNodeType === "battle") throw Error();
  story.storyNodes.ending.leaf = {
    summary: "Finished",
    version: 1,
    rewards: [{ keyId: "battle-persistence:victory", label: "Finished" }],
  };
  expect(save.battle!.phase).toBe("result-pending");
  const next = advanceBattle(story, save, command(save, "continue"), 2).save;
  expect(next.status).toBe("completed");
  expect(next.keys).toContain("battle-persistence:victory");
  expect(next.completion?.rewards).toHaveLength(1);
  expect(() =>
    advanceBattle(story, next, command(save, "continue"), 3),
  ).toThrow();
});
