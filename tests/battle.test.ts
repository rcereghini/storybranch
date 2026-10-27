import { expect, it } from "vitest";
import {
  battleConfigSchema,
  battleIntentSchema,
  battleResultSchema,
  battleStateSchema,
  battleId,
} from "../packages/contracts/battle";
import {
  startBattle,
  actBattle,
  validateBattleEntry,
  resolveBattleInputs,
  battleResultValue,
} from "../packages/domain/battle";
import { storySchema } from "../packages/contracts/index";
import { starterStory } from "../apps/web/src/studio-model";
const config = {
  version: 1 as const,
  rules: "battle-1" as const,
  enemy: { name: "Guard", maxHealth: 10, attack: 7, defense: 1, agility: 4 },
  maxTurns: 20,
};
const stats = {
  strength: 8,
  resolve: 8,
  agility: 5,
  intellect: 5,
  charisma: 5,
};
const identity = {
  runId: "run",
  storyId: "story",
  versionId: "edition-1",
  storyNodeId: "fight",
  entryRevision: 3,
};
const start = (c = config, h = 100, s = stats) =>
  startBattle(c, identity, h, s);
function act(
  current: ReturnType<typeof start>,
  action: string,
  revision = 3,
  c = config,
) {
  return actBattle(
    c,
    current.state,
    current.health,
    { identity, revision, expectedRevision: revision },
    {
      battleId: current.state.battleId,
      expectedTurn: current.state.turns,
      action,
    },
  );
}
function update(result: ReturnType<typeof act>) {
  if (result.kind !== "update") throw Error("Expected update");
  return result;
}
it("resolves documented combat, persists a pending win and requires Continue without mutation", () => {
  const initial = start(),
    before = JSON.stringify(initial);
  const first = update(act(initial, "attack"));
  expect(first.health).toBe(95);
  expect(first.state.enemyHealth).toBe(5);
  expect(first.revision).toBe(4);
  const second = update(act(first, "attack", 4));
  expect(second.health).toBe(95);
  expect(second.state).toMatchObject({
    phase: "result-pending",
    turns: 2,
    result: { outcome: "win", reason: "defeat" },
  });
  expect(act(second, "continue", 5)).toMatchObject({
    kind: "continue",
    result: { playerHealth: 95, enemyHealth: 0, turns: 2 },
  });
  expect(() => act(second, "attack", 5)).toThrow();
  expect(() => act(initial, "continue")).toThrow();
  expect(JSON.stringify(initial)).toBe(before);
  expect(act(first, "attack", 4)).toEqual(second);
});
it.each([4, 9])(
  "guards before either initiative order, rounds up and expires after one round (%i)",
  (agility) => {
    const c = { ...config, enemy: { ...config.enemy, agility } };
    const first = update(act(start(c), "guard", 3, c));
    expect(first.health).toBe(97);
    expect(first.state.enemyHealth).toBe(10);
    expect(update(act(first, "attack", 4, c)).health).toBe(92);
  },
);
it("enemy-first lethal damage prevents player retaliation", () => {
  const c = { ...config, enemy: { ...config.enemy, agility: 10 } };
  const result = update(act(start(c, 5), "attack", 3, c));
  expect(result.state).toMatchObject({
    enemyHealth: 10,
    turns: 1,
    result: { outcome: "loss", reason: "defeat" },
  });
});
it("initiative ties favor the player; preemptive overrides enemy agility and bonuses are bounded", () => {
  expect(start(config, 100, { ...stats, agility: 4 }).state.initiative).toBe(
    "player",
  );
  const c = {
    ...config,
    enemy: { ...config.enemy, agility: 20 },
    inputs: {
      preemptive: "surprise",
      attackBonus: "power",
      defenseBonus: "armor",
    },
  };
  const state = startBattle(c, identity, 100, stats, {
    surprise: true,
    power: 10,
    armor: 10,
  }).state;
  expect(state).toMatchObject({
    initiative: "player",
    playerAttack: 16,
    playerDefense: 12,
  });
  expect(() =>
    startBattle(c, identity, 100, stats, {
      surprise: true,
      power: 11,
      armor: 10,
    }),
  ).toThrow();
  expect(() =>
    startBattle(c, identity, 100, stats, { surprise: 1, power: 1, armor: 1 }),
  ).toThrow();
});
it("minimum damage is one, including Guard", () => {
  const c = { ...config, enemy: { ...config.enemy, attack: 1, defense: 10 } };
  const first = update(act(start(c), "attack", 3, c));
  expect(first.health).toBe(99);
  expect(first.state.enemyHealth).toBe(9);
  expect(update(act(first, "guard", 4, c)).health).toBe(98);
});
it("limits rounds while giving defeat priority on the final round", () => {
  const c = { ...config, maxTurns: 1 };
  expect(update(act(start(c), "guard", 3, c)).state).toMatchObject({
    result: { outcome: "loss", reason: "turn-limit", playerHealth: 97 },
  });
  const weak = { ...c, enemy: { ...c.enemy, maxHealth: 5 } };
  expect(update(act(start(weak), "attack", 3, weak)).state).toMatchObject({
    result: { outcome: "win", reason: "defeat" },
  });
  expect(update(act(start(c, 1), "guard", 3, c)).state).toMatchObject({
    result: { outcome: "loss", reason: "defeat" },
  });
});
it("zero health ends on entry; Escape is free and never increments turns", () => {
  const dead = start(config, 0);
  expect(dead.state).toMatchObject({
    turns: 0,
    result: { reason: "zero-health" },
  });
  expect(() => act(dead, "escape")).toThrow();
  expect(act(dead, "continue").kind).toBe("continue");
  const first = update(act(start(), "attack"));
  const escaped = update(act(first, "escape", 4));
  expect(escaped.health).toBe(95);
  expect(escaped.state).toMatchObject({
    turns: 1,
    enemyHealth: 5,
    result: { outcome: "escape", reason: "escaped" },
  });
});
it("serializes reload exactly and revisits use fresh identity without healing", () => {
  const first = update(act(start(), "guard"));
  expect(act(JSON.parse(JSON.stringify(first)), "attack", 4)).toEqual(
    act(first, "attack", 4),
  );
  const next = startBattle(
    config,
    { ...identity, entryRevision: 9 },
    first.health,
    stats,
  );
  expect(next.health).toBe(97);
  expect(next.state.enemyHealth).toBe(10);
  expect(next.state.battleId).not.toBe(first.state.battleId);
  expect(
    new Set(
      [
        identity,
        { ...identity, runId: "other" },
        { ...identity, versionId: "other" },
        { ...identity, storyNodeId: "other" },
        { ...identity, entryRevision: 9 },
      ].map(battleId),
    ).size,
  ).toBe(5);
  expect(
    new TextEncoder().encode(JSON.stringify(first.state)).length,
  ).toBeLessThan(8192);
});
it("rejects stale revision, visit, turn, identity and forged intent fields", () => {
  const current = start(),
    scope = { identity, revision: 3, expectedRevision: 3 },
    intent = {
      battleId: current.state.battleId,
      expectedTurn: 0,
      action: "attack",
    };
  for (const bad of [
    { ...scope, expectedRevision: 2 },
    { ...scope, identity: { ...identity, entryRevision: 2 } },
    { ...scope, revision: 2, expectedRevision: 2 },
  ])
    expect(() => actBattle(config, current.state, 100, bad, intent)).toThrow();
  for (const bad of [
    { ...intent, expectedTurn: 1 },
    { ...intent, battleId: "fake" },
    { ...intent, health: 100 },
    { ...intent, damage: 999 },
    { ...intent, action: "win" },
  ])
    expect(() => actBattle(config, current.state, 100, scope, bad)).toThrow();
});
it("rejects inconsistent stored state rather than repairing it", () => {
  const current = start();
  for (const state of [
    { ...current.state, enemyHealth: 11 },
    { ...current.state, enemyHealth: 9 },
    { ...current.state, turns: 20 },
    { ...current.state, battleId: "fake" },
    { ...current.state, result: {} },
  ])
    expect(() =>
      act({ ...current, state: state as typeof current.state }, "attack"),
    ).toThrow();
  const win = update(
    act(
      start({ ...config, enemy: { ...config.enemy, maxHealth: 5 } }),
      "attack",
      3,
      { ...config, enemy: { ...config.enemy, maxHealth: 5 } },
    ),
  );
  expect(() => act({ ...win, health: 1 }, "continue", 4)).toThrow();
  expect(() => act({ ...current, health: 0 }, "attack")).toThrow();
});
it("validates strict config, intent and result shapes and numerical boundaries", () => {
  for (const c of [
    { ...config, version: 2 },
    { ...config, rules: "custom" },
    { ...config, maxTurns: 0 },
    { ...config, maxTurns: 31 },
    { ...config, maxTurns: 1.5 },
    { ...config, loot: [] },
    { ...config, inputs: { attackBonus: "same", defenseBonus: "same" } },
    { ...config, enemy: { ...config.enemy, attack: Infinity } },
    { ...config, enemy: { ...config.enemy, name: " " } },
  ])
    expect(battleConfigSchema.safeParse(c).success).toBe(false);
  for (const field of ["maxHealth", "attack", "defense", "agility"] as const)
    for (const value of [-1, 101, 1.5, NaN])
      expect(
        battleConfigSchema.safeParse({
          ...config,
          enemy: { ...config.enemy, [field]: value },
        }).success,
      ).toBe(false);
  expect(
    battleIntentSchema.safeParse({
      battleId: "x",
      expectedTurn: 31,
      action: "attack",
    }).success,
  ).toBe(false);
  for (const r of [
    {
      outcome: "win",
      reason: "escaped",
      turns: 1,
      playerHealth: 10,
      enemyHealth: 0,
    },
    {
      outcome: "win",
      reason: "defeat",
      turns: 1,
      playerHealth: 0,
      enemyHealth: 0,
    },
    {
      outcome: "loss",
      reason: "zero-health",
      turns: 1,
      playerHealth: 0,
      enemyHealth: 10,
    },
    {
      outcome: "escape",
      reason: "escaped",
      turns: 1,
      playerHealth: 0,
      enemyHealth: 10,
    },
  ])
    expect(battleResultSchema.safeParse({ version: 1, ...r }).success).toBe(
      false,
    );
  expect(
    battleStateSchema.safeParse({ ...start().state, playerAttack: 23 }).success,
  ).toBe(false);
});
const declarations = {
  version: 1,
  fields: [
    { name: "bonus", type: "integer", required: true, default: 0 },
    { name: "surprise", type: "boolean", required: true, default: false },
  ],
};
const mapped = {
  ...config,
  inputs: { attackBonus: "bonus", preemptive: "surprise" },
};
const bindings = (source: unknown, input = "bonus") => ({
  version: 1,
  bindings: [{ input, source }],
});
it("proves constant/default/Dice ranges for each incoming edge", () => {
  expect(() => validateBattleEntry(mapped, declarations)).not.toThrow();
  expect(() =>
    validateBattleEntry(
      mapped,
      declarations,
      bindings({ kind: "constant", value: 10 }),
    ),
  ).not.toThrow();
  expect(() =>
    validateBattleEntry(
      mapped,
      declarations,
      bindings({ kind: "dice", field: "value" }),
      { sides: 10, target: 5 },
    ),
  ).not.toThrow();
  expect(() =>
    validateBattleEntry(
      mapped,
      declarations,
      bindings({ kind: "dice", field: "value" }),
      { sides: 20, target: 5 },
    ),
  ).toThrow();
  expect(() =>
    validateBattleEntry(
      mapped,
      declarations,
      bindings({ kind: "dice", field: "target" }),
      { sides: 20, target: 5 },
    ),
  ).not.toThrow();
  expect(() =>
    validateBattleEntry(
      mapped,
      declarations,
      bindings({ kind: "dice", field: "sides" }),
      { sides: 20, target: 5 },
    ),
  ).toThrow();
  expect(() =>
    validateBattleEntry(
      mapped,
      declarations,
      bindings({ kind: "dice", field: "passed" }, "surprise"),
      { sides: 20, target: 16 },
    ),
  ).not.toThrow();
  expect(() =>
    validateBattleEntry(
      mapped,
      declarations,
      bindings({ kind: "dice", field: "value" }),
    ),
  ).toThrow();
  expect(() =>
    validateBattleEntry(
      mapped,
      declarations,
      bindings({ kind: "constant", value: -1 }),
    ),
  ).toThrow();
});
it("rejects absent/optional/wrong-type mappings and runtime values without coercion", () => {
  expect(() => validateBattleEntry(mapped, undefined)).toThrow();
  expect(() =>
    validateBattleEntry(mapped, {
      ...declarations,
      fields: declarations.fields.map((f) => ({ ...f, required: false })),
    }),
  ).toThrow();
  expect(() =>
    validateBattleEntry(mapped, {
      version: 1,
      fields: [
        { name: "bonus", type: "boolean", required: true, default: true },
        { name: "surprise", type: "boolean", required: true, default: false },
      ],
    }),
  ).toThrow();
  expect(() =>
    validateBattleEntry(
      mapped,
      declarations,
      bindings({ kind: "constant", value: 1 }, "missing"),
    ),
  ).toThrow();
  expect(() => resolveBattleInputs(mapped, {})).toThrow();
  expect(() =>
    resolveBattleInputs(mapped, { bonus: "2", surprise: false }),
  ).toThrow();
  expect(resolveBattleInputs(config)).toEqual({
    preemptive: false,
    attackBonus: 0,
    defenseBonus: 0,
  });
});
it("projects only allowlisted terminal scalar results and keeps battle out of playable schemas", () => {
  const result = {
    version: 1,
    outcome: "win",
    reason: "defeat",
    turns: 2,
    playerHealth: 95,
    enemyHealth: 0,
  };
  expect(battleResultValue(result, "won")).toBe(true);
  expect(battleResultValue(result, "playerHealth")).toBe(95);
  expect(() => battleResultValue(result, "identity")).toThrow();
  const story = starterStory("battle-disabled");
  story.storyNodes[story.entryStoryNodeId].storyNodeType = "battle" as never;
  expect(storySchema.safeParse(story).success).toBe(false);
});

it("bounds a maximum-length Guard path and rejects inconsistent terminal limits", () => {
  const c = {
    ...config,
    maxTurns: 30,
    enemy: { ...config.enemy, maxHealth: 100, attack: 1 },
  };
  let current = start(c);
  for (let round = 0; round < 30; round++)
    current = update(act(current, "guard", 3 + round, c));
  expect(current.health).toBe(70);
  expect(current.state).toMatchObject({
    phase: "result-pending",
    turns: 30,
    result: { outcome: "loss", reason: "turn-limit" },
  });
  expect(() => act(current, "guard", 33, c)).toThrow();
  expect(act(current, "continue", 33, c).kind).toBe("continue");
  expect(() => act(current, "continue", 33, { ...c, maxTurns: 29 })).toThrow();
  if (current.state.phase !== "result-pending") throw Error("Expected result");
  const early = {
    ...current,
    state: {
      ...current.state,
      turns: 29,
      result: { ...current.state.result, turns: 29 },
    },
  };
  expect(() => act(early, "continue", 32, c)).toThrow();
});

it("requires sufficient revisions for the stored rounds and rejects all invalid starting stats", () => {
  const first = update(act(start(), "guard"));
  expect(() => act(first, "attack", 3)).toThrow();
  for (const field of Object.keys(stats))
    for (const value of [0, 21, 1.5, Infinity])
      expect(() =>
        startBattle(config, identity, 100, { ...stats, [field]: value }),
      ).toThrow();
  for (const health of [-1, 101, NaN])
    expect(() => start(config, health)).toThrow();
});
