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
import {
  startBattleStory,
  advanceBattleChoice,
} from "../packages/domain/battle-player";
function mixedFixture(dice = false) {
  const { story } = fixture();
  const battle = story.storyNodes.opening;
  if (battle.storyNodeType !== "battle") throw Error();
  battle.id = "fight";
  story.storyNodes.fight = battle;
  const opening = structuredClone(starterStory(story.id).storyNodes.opening);
  opening.storyNodeType = dice ? "dice" : "text";
  const route = {
    targetStoryNodeId: "fight",
    effects: [{ id: "entry-damage", kind: "health" as const, delta: -5 }],
    inputBindings: {
      version: 1 as const,
      bindings: [
        { input: "bonus", source: { kind: "constant" as const, value: 3 } },
      ],
    },
  };
  opening.choices = [
    {
      id: "enter",
      label: "Enter",
      costs: [],
      unavailableDisplay: "hidden",
      outcome: dice
        ? {
            kind: "dice",
            sides: 20,
            target: 10,
            success: route,
            failure: route,
          }
        : { kind: "direct", route },
    },
  ];
  story.storyNodes.opening = opening;
  battle.inputs = {
    version: 1,
    fields: [{ name: "bonus", type: "integer", required: true }],
  };
  battle.battle.inputs = { attackBonus: "bonus" };
  battle.entryEffects = [
    { id: "first-entry", kind: "stat", stat: "strength", delta: 2 },
  ];
  const save = startBattleStory(
    story,
    "mixed",
    "player",
    { strength: 8, agility: 8, resolve: 8, intellect: 8, charisma: 8 },
    1,
  );
  return { story, save, battle, opening };
}
function choose(save: BattleSave, action?: "roll" | "continue") {
  return {
    idempotencyKey: "choice",
    expectedRevision: save.revision,
    payload: { choiceId: "enter", ...(action ? { action } : {}) },
  };
}
it("enters a battle from an ordinary choice after mapped inputs and effects", () => {
  const { story, save } = mixedFixture();
  const entered = advanceBattleChoice(story, save, choose(save), 2)
    .save as BattleSave;
  expect(entered.storyNodeId).toBe("fight");
  expect(entered.health).toBe(95);
  expect(entered.stats.strength).toBe(10);
  expect(entered.battle?.playerAttack).toBe(10);
  expect(entered.battle?.identity.entryRevision).toBe(1);
  expect(entered.nodeInputs?.values).toEqual({ bonus: 3 });
  expect(save.storyNodeId).toBe("opening");
  expect(() => advanceBattleChoice(story, entered, choose(entered), 3)).toThrow(
    "battle controls",
  );
});
it("keeps Dice Roll pending and enters battle only on separate Next", () => {
  const { story, save } = mixedFixture(true);
  let samples = 0;
  expect(() => advanceBattleChoice(story, save, choose(save), 2)).toThrow(
    "Roll before",
  );
  const rolled = advanceBattleChoice(
    story,
    save,
    choose(save, "roll"),
    2,
    () => {
      samples++;
      return 14;
    },
  ).save as BattleSave;
  expect(rolled.storyNodeId).toBe("opening");
  expect(rolled.battle).toBeUndefined();
  expect(rolled.health).toBe(100);
  expect(rolled.lastRoll?.pending).toBe(true);
  const entered = advanceBattleChoice(story, rolled, choose(rolled), 3, () => {
    samples++;
    return 1;
  }).save as BattleSave;
  expect(samples).toBe(1);
  expect(entered.battle?.identity.entryRevision).toBe(2);
  expect(entered.health).toBe(95);
});
it("starts battle defaults after entry effects and isolates parent context", () => {
  const { story, save, battle } = mixedFixture();
  story.entryStoryNodeId = "fight";
  battle.inputs!.fields[0].default = 2;
  const parent = structuredClone(save);
  parent.keys.push("other:private");
  const child = startBattleStory(
    story,
    "child",
    "player",
    save.stats,
    3,
    parent,
  );
  expect(child.parentPlaythroughId).toBe(parent.id);
  expect(child.battle?.playerAttack).toBe(9);
  expect(child.keys).not.toContain("other:private");
  expect(parent).toEqual({ ...save, keys: [...save.keys, "other:private"] });
});
it("creates fresh battle visits without repeating once-only entry effects", () => {
  const { story, save, battle } = mixedFixture();
  battle.outputs.escape = { targetStoryNodeId: "opening", effects: [] };
  const first = advanceBattleChoice(story, save, choose(save), 2)
    .save as BattleSave;
  const escaped = advanceBattle(story, first, command(first, "escape"), 3).save;
  const returned = advanceBattle(
    story,
    escaped,
    command(escaped, "continue"),
    4,
  ).save;
  const second = advanceBattleChoice(story, returned, choose(returned), 5)
    .save as BattleSave;
  expect(second.battle?.battleId).not.toBe(first.battle?.battleId);
  expect(second.stats.strength).toBe(10);
  expect(second.health).toBe(90);
  expect(second.battle?.turns).toBe(0);
});
it("rejects forged or failed battle entry without consuming costs or effects", () => {
  const { story, save, battle, opening } = mixedFixture();
  opening.choices[0].costs = [
    { itemId: "battle-persistence:coin", quantity: 1 },
  ];
  save.items["battle-persistence:coin"] = 1;
  const before = structuredClone(save);
  battle.battle.inputs = { attackBonus: "missing" };
  expect(() => advanceBattleChoice(story, save, choose(save), 2)).toThrow();
  expect(save).toEqual(before);
  expect(() =>
    advanceBattleChoice(
      story,
      save,
      { ...choose(save), payload: { choiceId: "enter", health: 100 } },
      2,
    ),
  ).toThrow();
});
it("rechecks account-gated choices and rejects stale commands", () => {
  const { story, save, opening } = mixedFixture();
  opening.choices[0].availableWhen = {
    kind: "key",
    scope: "account",
    keyId: "battle-persistence:access",
    present: true,
  };
  expect(() => advanceBattleChoice(story, save, choose(save), 2)).toThrow(
    "Account key access changed",
  );
  expect(
    advanceBattleChoice(story, save, choose(save), 2, undefined, [
      "battle-persistence:access",
    ]).save.storyNodeId,
  ).toBe("fight");
  expect(() =>
    advanceBattleChoice(
      story,
      save,
      { ...choose(save), expectedRevision: 1 },
      2,
      undefined,
      ["battle-persistence:access"],
    ),
  ).toThrow("Progress changed");
});
