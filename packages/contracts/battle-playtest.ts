import { z } from "zod";
import { previewScenarioSchema } from "./preview";

const nodeId = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
export const battlePlaytestIntentSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("choice"),
      choiceId: nodeId,
      action: z.enum(["roll", "continue"]),
    })
    .strict(),
  z
    .object({
      kind: z.literal("battle"),
      action: z.enum(["attack", "guard", "escape", "continue"]),
    })
    .strict(),
]);
const encounterExpectation = z
  .object({
    phase: z.enum(["active", "result-pending"]),
    turns: z.number().int().min(0).max(30),
    playerHealth: z.number().int().min(0).max(100),
    enemyHealth: z.number().int().min(0).max(100),
    outcome: z.enum(["win", "loss", "escape"]).nullable(),
  })
  .strict()
  .refine(
    (value) => (value.phase === "active") === (value.outcome === null),
    "Only terminal encounters have outcomes.",
  );
export const battlePlaytestStepSchema = z
  .object({
    from: nodeId,
    intent: battlePlaytestIntentSchema,
    roll: z.number().int().min(1).max(100).optional(),
    expected: z
      .object({
        storyNodeId: nodeId,
        status: z.enum(["active", "completed"]),
        health: z.number().int().min(0).max(100),
        battle: encounterExpectation.nullable(),
      })
      .strict(),
  })
  .strict()
  .refine(
    (step) =>
      (step.intent.kind === "choice" && step.intent.action === "roll") ===
      (step.roll !== undefined),
    "Only Roll steps require an exact draw.",
  );
// Deliberately separate from saved Studio setups until the shared preview is wired.
export const battlePlaytestScenarioSchema = previewScenarioSchema.omit({
  replay: true,
});
export const battlePlaytestReplaySchema = z
  .object({
    version: z.literal(1),
    steps: z.array(battlePlaytestStepSchema).min(1).max(100),
  })
  .strict();
export type BattlePlaytestIntent = z.infer<typeof battlePlaytestIntentSchema>;
export type BattlePlaytestStep = z.infer<typeof battlePlaytestStepSchema>;
