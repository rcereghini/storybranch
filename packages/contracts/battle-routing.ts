import { z } from "zod";
import { storyRouteSchema } from "./index";
import { inputName, inputValueSchema } from "./branch-data";

// Deliberately separate from ordinary Story bindings until the battle player is enabled.
export const battleOutputBindingsSchema = z
  .object({
    version: z.literal(1),
    bindings: z
      .array(
        z
          .object({
            input: inputName,
            source: z.discriminatedUnion("kind", [
              z
                .object({
                  kind: z.literal("constant"),
                  value: inputValueSchema,
                })
                .strict(),
              z
                .object({
                  kind: z.literal("battle"),
                  field: z.enum([
                    "won",
                    "turns",
                    "playerHealth",
                    "enemyHealth",
                  ]),
                })
                .strict(),
            ]),
          })
          .strict(),
      )
      .max(16)
      .refine(
        (bindings) =>
          new Set(bindings.map((b) => b.input)).size === bindings.length,
        "Duplicate input binding.",
      ),
  })
  .strict();
export const battleOutputRouteSchema = storyRouteSchema.extend({
  inputBindings: battleOutputBindingsSchema.optional(),
});
export const battleOutputsSchema = z
  .object({
    win: battleOutputRouteSchema,
    loss: battleOutputRouteSchema,
    escape: battleOutputRouteSchema,
  })
  .strict();
export type BattleOutputs = z.infer<typeof battleOutputsSchema>;
