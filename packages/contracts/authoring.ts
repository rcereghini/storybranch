import { z } from "zod";
import { id, storySchema } from "./index";

export const draftSchema = z
  .object({
    story: storySchema,
    description: z.string().max(500),
  })
  .strict()
  .superRefine((draft, ctx) => {
    if (Object.keys(draft.story.pages).length > 80)
      ctx.addIssue({
        code: "custom",
        message: "A draft supports at most 80 pages.",
      });
    if (draft.story.title.length > 160)
      ctx.addIssue({
        code: "custom",
        message: "Title must be at most 160 characters.",
      });
  });
export type Draft = z.infer<typeof draftSchema>;
export type DraftRecord = Draft & {
  revision: number;
  publishedVersionId: string | null;
};
export const draftCommandSchema = z
  .object({
    idempotencyKey: id,
    expectedRevision: z.number().int().min(0),
    draft: draftSchema,
  })
  .strict();
export const publishCommandSchema = z
  .object({
    idempotencyKey: id,
    expectedRevision: z.number().int().min(1),
    policyVersion: z.literal("creator-alpha-1"),
  })
  .strict();
