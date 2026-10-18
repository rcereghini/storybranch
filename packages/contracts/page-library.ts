import { z } from "zod";
import { id, pageSchema, type StoryPage } from "./index";

// Content and logical output slots have no story destinations or player state.
export const pageContentSchema = pageSchema
  .pick({
    title: true,
    transcript: true,
    pageType: true,
    video: true,
    videoAdvance: true,
    image: true,
  })
  .extend({
    pageType: z.enum(["text", "text-options", "video", "video-options"]),
    outputs: z
      .array(
        z
          .object({
            id,
            label: z.string().min(1).max(160),
            hint: z.string().max(200).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(20),
  })
  .strict()
  .superRefine((page, ctx) => {
    if (page.pageType.startsWith("video") && !page.video)
      ctx.addIssue({ code: "custom", message: "Choose a video." });
    if (page.videoAdvance && page.pageType !== "video")
      ctx.addIssue({
        code: "custom",
        message: "Only linear video pages support automatic advance.",
      });
    if (!page.pageType.endsWith("options") && page.outputs.length !== 1)
      ctx.addIssue({
        code: "custom",
        message: "Linear pages need one output.",
      });
    if (new Set(page.outputs.map((o) => o.id)).size !== page.outputs.length)
      ctx.addIssue({ code: "custom", message: "Output IDs must be unique." });
  });
export type PageContent = z.infer<typeof pageContentSchema>;
export type LibraryPage = {
  id: string;
  revision: number;
  content: PageContent;
  shared: boolean;
};
export const libraryCommandSchema = z
  .object({
    idempotencyKey: id,
    expectedRevision: z.number().int().min(0),
    content: pageContentSchema,
  })
  .strict();
export const sharePageCommandSchema = z
  .object({ idempotencyKey: id, revision: z.number().int().positive() })
  .strict();

export function contentOf(page: StoryPage): PageContent {
  return pageContentSchema.parse({
    title: page.title,
    transcript: page.transcript,
    pageType: page.pageType,
    ...(page.video ? { video: page.video } : {}),
    ...(page.videoAdvance ? { videoAdvance: page.videoAdvance } : {}),
    ...(page.image ? { image: page.image } : {}),
    outputs: page.choices.length
      ? page.choices.map(({ id, label, hint }) => ({
          id,
          label,
          ...(hint ? { hint } : {}),
        }))
      : [{ id: "continue", label: "Continue" }],
  });
}
export function placePage(
  record: LibraryPage,
  instanceId: string,
  target: string,
): StoryPage {
  const { outputs, ...content } = record.content;
  return {
    ...content,
    id: instanceId,
    kind: "scene",
    entryEffects: [],
    sourcePage: { id: record.id, revision: record.revision },
    choices: outputs.map((output) => ({
      ...output,
      unavailableDisplay: "locked",
      costs: [],
      outcome: { kind: "direct", route: { targetPageId: target, effects: [] } },
    })),
  };
}
