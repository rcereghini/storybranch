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
// Disposable authoring input only; never part of a draft or command schema.
export const previewScenarioSchema = z
  .object({
    version: z.literal(1),
    storyKeys: keys(40),
    importedKeys: keys(20),
    accountKeys: keys(20).default([]),
    stats: previewStatsSchema.optional(),
    items: previewItemsSchema.optional(),
  })
  .strict();
export type PreviewScenario = z.infer<typeof previewScenarioSchema>;
