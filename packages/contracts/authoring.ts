import { z } from "zod";
import { id, storySchema } from "./index";
export const storyNodePositionsSchema = z
  .record(
    id,
    z
      .object({
        x: z.number().finite().min(0).max(50000),
        y: z.number().finite().min(0).max(50000),
      })
      .strict(),
  )
  .refine(
    (positions) => Object.keys(positions).length <= 80,
    "At most 80 StoryNode positions.",
  );
export type StoryNodePositions = z.infer<typeof storyNodePositionsSchema>;
// Draft-only comic help: a shared art style and recurring characters, each
// with a reference image that keeps them consistent across generated panels.
// Like StoryNode positions, it never becomes part of a published edition.
export const maxCast = 6;
export const comicStudioSchema = z
  .object({
    style: z.string().max(300),
    cast: z
      .array(
        z
          .object({
            id,
            name: z.string().max(60),
            description: z.string().max(400),
            image: z
              .string()
              .regex(/^asset:[a-zA-Z0-9_-]{8,80}$/)
              .optional(),
          })
          .strict(),
      )
      .max(maxCast),
  })
  .strict();
export type ComicStudio = z.infer<typeof comicStudioSchema>;
export type CastMember = ComicStudio["cast"][number];

export const draftSchema = z
  .object({
    story: storySchema,
    description: z.string().max(500),
    storyNodePositions: storyNodePositionsSchema.optional(),
    comic: comicStudioSchema.optional(),
  })
  .strict()
  .superRefine((draft, ctx) => {
    if (Object.keys(draft.story.storyNodes).length > 80)
      ctx.addIssue({
        code: "custom",
        message: "A draft supports at most 80 StoryNodes.",
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
