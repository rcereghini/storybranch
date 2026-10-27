import { z } from "zod";

const previewStat = z.number().int().min(1).max(20);
export const previewStatsSchema = z
  .object({
    strength: previewStat,
    agility: previewStat,
    intellect: previewStat,
    resolve: previewStat,
    charisma: previewStat,
  })
  .strict();
const previewItemsSchema = z
  .record(
    z
      .string()
      .max(100)
      .regex(/^[a-z0-9-]+:[a-z0-9-]+$/),
    z.number().int().min(0).max(999),
  )
  .refine(
    (items) => Object.keys(items).length <= 40,
    "Use at most 40 starting items.",
  );

const keys = (max: number) =>
  z
    .array(
      z
        .string()
        .max(100)
        .regex(/^[a-z0-9-]+:[a-z0-9-]+$/),
    )
    .max(max)
    .refine(
      (values) => new Set(values).size === values.length,
      "Preview keys must be unique.",
    );
const nodeId = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
export const playtestStepSchema = z
  .object({
    from: nodeId,
    choiceId: nodeId,
    action: z.enum(["roll", "continue"]),
    roll: z.number().int().min(1).max(100).optional(),
    expected: z
      .object({ storyNodeId: nodeId, status: z.enum(["active", "completed"]) })
      .strict(),
  })
  .strict()
  .refine(
    (step) => (step.action === "roll") === (step.roll !== undefined),
    "Only Roll steps require an exact result.",
  );
export const playtestReplaySchema = z
  .object({
    version: z.literal(1),
    steps: z.array(playtestStepSchema).min(1).max(100),
  })
  .strict();
export type PlaytestStep = z.infer<typeof playtestStepSchema>;
export const previewDiceSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("highest") }).strict(),
  z.object({ mode: z.literal("lowest") }).strict(),
  z
    .object({
      mode: z.literal("fixed"),
      value: z.number().int().min(1).max(100),
    })
    .strict(),
]);
// Authoring simulation only; S31 can save a starting setup in a private draft.
export const previewScenarioSchema = z
  .object({
    version: z.literal(1),
    storyKeys: keys(40),
    importedKeys: keys(20),
    accountKeys: keys(20).default([]),
    stats: previewStatsSchema.optional(),
    items: previewItemsSchema.optional(),
    dice: previewDiceSchema.optional(),
    replay: playtestReplaySchema.optional(),
  })
  .strict();
export type PreviewScenario = z.infer<typeof previewScenarioSchema>;

export const savedPlaytestScenariosSchema = z
  .array(
    z
      .object({
        id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
        name: z.string().trim().min(1).max(60),
        scenario: previewScenarioSchema,
      })
      .strict(),
  )
  .max(20)
  .superRefine((entries, ctx) => {
    if (
      new Set(entries.map((e) => e.id)).size !== entries.length ||
      new Set(entries.map((e) => e.name.toLowerCase())).size !== entries.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Saved setups need unique IDs and names.",
      });
  });
export type SavedPlaytestScenario = z.infer<
  typeof savedPlaytestScenariosSchema
>[number];
