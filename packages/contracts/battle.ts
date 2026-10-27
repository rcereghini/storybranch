import { z } from "zod";
import { id } from "./index";
import { inputName } from "./branch-data";

const integer = (min: number, max: number) =>
  z.number().int().min(min).max(max);
export const battleHealthSchema = integer(0, 100);
export const battleConfigSchema = z
  .object({
    version: z.literal(1),
    rules: z.literal("battle-1"),
    enemy: z
      .object({
        name: z.string().trim().min(1).max(80),
        maxHealth: integer(1, 100),
        attack: integer(1, 20),
        defense: integer(0, 10),
        agility: integer(1, 20),
      })
      .strict(),
    maxTurns: integer(1, 30),
    inputs: z
      .object({
        preemptive: inputName.optional(),
        attackBonus: inputName.optional(),
        defenseBonus: inputName.optional(),
      })
      .strict()
      .refine(
        (v) =>
          new Set(Object.values(v).filter((x) => x !== undefined)).size ===
          Object.values(v).filter((x) => x !== undefined).length,
        "Battle input mappings must be distinct.",
      )
      .optional(),
  })
  .strict();
export type BattleConfig = z.infer<typeof battleConfigSchema>;
export const battleInputsSchema = z
  .object({
    preemptive: z.boolean(),
    attackBonus: integer(0, 10),
    defenseBonus: integer(0, 10),
  })
  .strict();
export const battleIdentitySchema = z
  .object({
    runId: id,
    versionId: id,
    storyNodeId: id,
    entryRevision: integer(0, Number.MAX_SAFE_INTEGER),
  })
  .strict();
export type BattleIdentity = z.infer<typeof battleIdentitySchema>;
export const battleId = (identity: BattleIdentity) =>
  JSON.stringify([
    identity.runId,
    identity.versionId,
    identity.storyNodeId,
    identity.entryRevision,
  ]);
export const battleResultSchema = z
  .object({
    version: z.literal(1),
    outcome: z.enum(["win", "loss", "escape"]),
    reason: z.enum(["defeat", "turn-limit", "zero-health", "escaped"]),
    turns: integer(0, 30),
    playerHealth: battleHealthSchema,
    enemyHealth: battleHealthSchema,
  })
  .strict()
  .refine((r) => {
    if (r.outcome === "win")
      return (
        r.reason === "defeat" &&
        r.turns > 0 &&
        r.playerHealth > 0 &&
        r.enemyHealth === 0
      );
    if (r.outcome === "escape")
      return r.reason === "escaped" && r.playerHealth > 0 && r.enemyHealth > 0;
    if (r.enemyHealth === 0) return false;
    if (r.reason === "zero-health")
      return r.turns === 0 && r.playerHealth === 0;
    if (r.reason === "defeat") return r.turns > 0 && r.playerHealth === 0;
    return r.reason === "turn-limit" && r.turns > 0 && r.playerHealth > 0;
  }, "Inconsistent battle result.");
export type BattleResult = z.infer<typeof battleResultSchema>;
const common = {
  version: z.literal(1),
  rules: z.literal("battle-1"),
  identity: battleIdentitySchema,
  battleId: z.string().max(300),
  initiative: z.enum(["player", "enemy"]),
  playerAttack: integer(2, 22),
  playerDefense: integer(0, 15),
  enemyHealth: battleHealthSchema,
  turns: integer(0, 30),
};
// All fields have tight scalar bounds: serialized state is below 8 KiB without a platform encoder.
export const battleStateSchema = z
  .discriminatedUnion("phase", [
    z.object({ ...common, phase: z.literal("active") }).strict(),
    z
      .object({
        ...common,
        phase: z.literal("result-pending"),
        result: battleResultSchema,
      })
      .strict(),
  ])
  .refine(
    (s) => s.battleId === battleId(s.identity),
    "Battle identity mismatch.",
  )
  .refine(
    (s) =>
      s.phase === "active"
        ? s.enemyHealth > 0
        : s.result.turns === s.turns && s.result.enemyHealth === s.enemyHealth,
    "Battle state/result mismatch.",
  );
export type BattleState = z.infer<typeof battleStateSchema>;
export const battleIntentSchema = z
  .object({
    battleId: z.string().min(1).max(300),
    expectedTurn: integer(0, 30),
    action: z.enum(["attack", "guard", "escape", "continue"]),
  })
  .strict();
export const battleStatsSchema = z
  .object({
    strength: integer(1, 20),
    agility: integer(1, 20),
    intellect: integer(1, 20),
    resolve: integer(1, 20),
    charisma: integer(1, 20),
  })
  .strict();
