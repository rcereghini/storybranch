import { z } from "zod";

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
  })
  .strict();
export type PreviewScenario = z.infer<typeof previewScenarioSchema>;
