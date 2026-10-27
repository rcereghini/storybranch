import { z } from "zod";
import { id } from "./index";
import { battleConfigSchema } from "./battle";
import { battlePlaytestReplaySchema } from "./battle-playtest";

// Version-1 rehearsal metadata only. Never merged into a published Story.
export const battleWorkshopSetupSchema = z
  .object({
    storyNodeId: id,
    enemy: battleConfigSchema.shape.enemy,
    maxTurns: battleConfigSchema.shape.maxTurns,
    targets: z.object({ win: id, loss: id, escape: id }).strict(),
  })
  .strict();
export type BattleWorkshopSetup = z.infer<typeof battleWorkshopSetupSchema>;
export const savedBattlePlaytestsSchema = z
  .array(
    z
      .object({
        version: z.literal(1),
        id,
        name: z.string().trim().min(1).max(60),
        setup: battleWorkshopSetupSchema,
        replay: battlePlaytestReplaySchema.optional(),
      })
      .strict(),
  )
  .max(10)
  .superRefine((entries, ctx) => {
    if (
      new Set(entries.map((entry) => entry.id)).size !== entries.length ||
      new Set(entries.map((entry) => entry.name.toLowerCase())).size !==
        entries.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Rehearsals need unique IDs and names.",
      });
    if (
      entries.reduce(
        (total, entry) => total + (entry.replay?.steps.length ?? 0),
        0,
      ) > 500
    )
      ctx.addIssue({
        code: "custom",
        message:
          "At most 500 recorded commands across saved battle rehearsals.",
      });
  });
export type SavedBattlePlaytest = z.infer<
  typeof savedBattlePlaytestsSchema
>[number];
