import { z } from "zod";
import { GameError } from "../contracts/index";
import {
  battleConfigSchema,
  battleScopeSchema,
  battleHealthSchema,
  battleIdentitySchema,
  battleId,
  battleInputsSchema,
  battleIntentSchema,
  battleResultSchema,
  battleStateSchema,
  battleStatsSchema,
  type BattleConfig,
  type BattleIdentity,
  type BattleState,
  type BattleResult,
} from "../contracts/battle";
import {
  nodeInputsSchema,
  inputBindingsSchema,
  inputValueSchema,
  inputName,
  inputType,
} from "../contracts/branch-data";

function requireValid(ok: boolean, message: string): asserts ok {
  if (!ok) throw new GameError("VALIDATION_FAILED", message);
}
const diceSchema = z
  .object({
    sides: z.number().int().min(2).max(100),
    target: z.number().int().min(1).max(100),
  })
  .strict()
  .refine((d) => d.target <= d.sides);

// Call for each incoming edge (and entry defaults), alongside graph validation.
export function validateBattleEntry(
  configInput: unknown,
  declarationsInput: unknown,
  bindingsInput?: unknown,
  diceInput?: unknown,
) {
  const config = battleConfigSchema.parse(configInput);
  const declarations = nodeInputsSchema.optional().parse(declarationsInput);
  const bindings = inputBindingsSchema.optional().parse(bindingsInput);
  const dice = diceSchema.optional().parse(diceInput);
  const fields = declarations?.fields ?? [];
  for (const b of bindings?.bindings ?? []) {
    const f = fields.find((f) => f.name === b.input);
    requireValid(!!f, "Unknown destination input.");
    requireValid(
      b.source.kind !== "dice" || !!dice,
      "Dice source requires a Dice edge.",
    );
    const type =
      b.source.kind === "constant"
        ? inputType(b.source.value)
        : b.source.field === "passed"
          ? "boolean"
          : "integer";
    requireValid(f.type === type, "Input type mismatch.");
  }
  for (const f of fields)
    requireValid(
      !f.required ||
        f.default !== undefined ||
        !!bindings?.bindings.some((b) => b.input === f.name),
      "Missing required input.",
    );
  for (const [key, name] of Object.entries(config.inputs ?? {})) {
    if (name === undefined) continue;
    const field = fields.find((f) => f.name === name);
    requireValid(
      !!field && field.required,
      "Battle mappings require declared required inputs.",
    );
    requireValid(
      field.type === (key === "preemptive" ? "boolean" : "integer"),
      "Battle input type mismatch.",
    );
    const source = bindings?.bindings.find((b) => b.input === name)?.source;
    if (source?.kind === "dice") {
      requireValid(!!dice, "Dice source requires a Dice edge.");
      if (key !== "preemptive") {
        const maximum = source.field === "target" ? dice.target : dice.sides;
        requireValid(maximum <= 10, "Battle bonus source exceeds 0–10.");
      }
    } else {
      const value = source?.kind === "constant" ? source.value : field.default;
      requireValid(
        key === "preemptive"
          ? typeof value === "boolean"
          : typeof value === "number" && value >= 0 && value <= 10,
        "Battle input outside its range.",
      );
    }
  }
}

export function resolveBattleInputs(
  configInput: unknown,
  valuesInput: unknown = {},
) {
  const config = battleConfigSchema.parse(configInput);
  const values = z
    .record(inputName, inputValueSchema)
    .refine((v) => Object.keys(v).length <= 16)
    .parse(valuesInput);
  const read = (
    key: "preemptive" | "attackBonus" | "defenseBonus",
    fallback: boolean | number,
  ) => {
    const name = config.inputs?.[key];
    if (name === undefined) return fallback;
    requireValid(Object.hasOwn(values, name), "Missing battle input.");
    return values[name];
  };
  return battleInputsSchema.parse({
    preemptive: read("preemptive", false),
    attackBonus: read("attackBonus", 0),
    defenseBonus: read("defenseBonus", 0),
  });
}

function finish(
  state: BattleState,
  health: number,
  outcome: BattleResult["outcome"],
  reason: BattleResult["reason"],
): BattleState {
  return battleStateSchema.parse({
    ...state,
    phase: "result-pending",
    result: battleResultSchema.parse({
      version: 1,
      outcome,
      reason,
      turns: state.turns,
      playerHealth: health,
      enemyHealth: state.enemyHealth,
    }),
  });
}
export function startBattle(
  configInput: unknown,
  identityInput: unknown,
  healthInput: unknown,
  statsInput: unknown,
  valuesInput: unknown = {},
) {
  const config = battleConfigSchema.parse(configInput),
    identity = battleIdentitySchema.parse(identityInput),
    health = battleHealthSchema.parse(healthInput),
    stats = battleStatsSchema.parse(statsInput);
  const inputs = resolveBattleInputs(config, valuesInput);
  let state: BattleState = battleStateSchema.parse({
    version: 1,
    rules: config.rules,
    identity,
    battleId: battleId(identity),
    initiative:
      inputs.preemptive || stats.agility >= config.enemy.agility
        ? "player"
        : "enemy",
    playerAttack: 2 + Math.floor(stats.strength / 2) + inputs.attackBonus,
    playerDefense: Math.floor(stats.resolve / 4) + inputs.defenseBonus,
    enemyHealth: config.enemy.maxHealth,
    turns: 0,
    phase: "active",
  });
  if (health === 0) state = finish(state, health, "loss", "zero-health");
  return { state, health };
}

function validateState(
  config: BattleConfig,
  state: BattleState,
  health: number,
  identity: BattleIdentity,
) {
  requireValid(
    state.battleId === battleId(identity),
    "Battle belongs to another entry.",
  );
  requireValid(
    state.enemyHealth <= config.enemy.maxHealth &&
      state.turns <= config.maxTurns,
    "Battle state exceeds encounter bounds.",
  );
  if (state.phase === "active")
    requireValid(
      health > 0 && state.turns < config.maxTurns,
      "Invalid active battle.",
    );
  else {
    const r = state.result;
    requireValid(r.playerHealth === health, "Battle result health mismatch.");
    if (r.reason === "turn-limit")
      requireValid(
        state.turns === config.maxTurns,
        "Invalid turn-limit result.",
      );
    if (r.reason === "escaped")
      requireValid(state.turns < config.maxTurns, "Escape after turn limit.");
  }
  if (state.turns === 0)
    requireValid(
      state.enemyHealth === config.enemy.maxHealth,
      "Enemy damaged before first round.",
    );
}

// No Save mutation or receipt handling here. The service must commit the proposal atomically.
export function actBattle(
  configInput: unknown,
  stateInput: unknown,
  healthInput: unknown,
  scopeInput: unknown,
  intentInput: unknown,
) {
  const config = battleConfigSchema.parse(configInput),
    state = battleStateSchema.parse(stateInput),
    health = battleHealthSchema.parse(healthInput),
    intent = battleIntentSchema.parse(intentInput);
  const scope = battleScopeSchema.parse(scopeInput);
  requireValid(
    scope.revision === scope.expectedRevision &&
      scope.revision >= scope.identity.entryRevision + state.turns,
    "Stale battle revision.",
  );
  validateState(config, state, health, scope.identity);
  requireValid(
    intent.battleId === state.battleId && intent.expectedTurn === state.turns,
    "Stale battle intent.",
  );
  if (intent.action === "continue") {
    requireValid(state.phase === "result-pending", "Battle is not complete.");
    return { kind: "continue" as const, result: state.result };
  }
  requireValid(state.phase === "active", "Battle already complete.");
  if (intent.action === "escape")
    return {
      kind: "update" as const,
      state: finish(state, health, "escape", "escaped"),
      health,
      revision: scope.revision + 1,
    };
  let playerHealth = health,
    enemyHealth = state.enemyHealth;
  const playerAttack = () => {
    if (intent.action === "attack")
      enemyHealth = Math.max(
        0,
        enemyHealth - Math.max(1, state.playerAttack - config.enemy.defense),
      );
  };
  const enemyAttack = () => {
    const damage = Math.max(1, config.enemy.attack - state.playerDefense);
    playerHealth = Math.max(
      0,
      playerHealth -
        (intent.action === "guard" ? Math.ceil(damage / 2) : damage),
    );
  };
  if (state.initiative === "player") {
    playerAttack();
    if (enemyHealth > 0) enemyAttack();
  } else {
    enemyAttack();
    if (playerHealth > 0) playerAttack();
  }
  let next: BattleState = { ...state, enemyHealth, turns: state.turns + 1 };
  if (playerHealth === 0) next = finish(next, playerHealth, "loss", "defeat");
  else if (enemyHealth === 0)
    next = finish(next, playerHealth, "win", "defeat");
  else if (next.turns === config.maxTurns)
    next = finish(next, playerHealth, "loss", "turn-limit");
  return {
    kind: "update" as const,
    state: battleStateSchema.parse(next),
    health: playerHealth,
    revision: scope.revision + 1,
  };
}

// Consume only the terminal result returned by a validated Continue; source registration is deferred.
export function battleResultValue(resultInput: unknown, fieldInput: unknown) {
  const result = battleResultSchema.parse(resultInput);
  const field = z
    .enum(["won", "turns", "playerHealth", "enemyHealth"])
    .parse(fieldInput);
  return field === "won" ? result.outcome === "win" : result[field];
}
