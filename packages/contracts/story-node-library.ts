import { z } from "zod";
import { id, storyNodeSchema, type StoryNode } from "./index";

// Content and logical output slots have no story destinations or player state.
export const storyNodeContentSchema = storyNodeSchema
  .pick({
    title: true,
    transcript: true,
    storyNodeType: true,
    video: true,
    videoAdvance: true,
    image: true,
  })
  .extend({
    storyNodeType: z.enum(["text", "text-options", "video", "video-options"]),
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
  .superRefine((storyNode, ctx) => {
    if (storyNode.storyNodeType.startsWith("video") && !storyNode.video)
      ctx.addIssue({ code: "custom", message: "Choose a video." });
    if (storyNode.videoAdvance && storyNode.storyNodeType !== "video")
      ctx.addIssue({
        code: "custom",
        message: "Only linear video StoryNodes support automatic advance.",
      });
    if (
      !storyNode.storyNodeType.endsWith("options") &&
      storyNode.outputs.length !== 1
    )
      ctx.addIssue({
        code: "custom",
        message: "Linear StoryNodes need one output.",
      });
    if (
      new Set(storyNode.outputs.map((o) => o.id)).size !==
      storyNode.outputs.length
    )
      ctx.addIssue({ code: "custom", message: "Output IDs must be unique." });
  });
export type StoryNodeContent = z.infer<typeof storyNodeContentSchema>;
export type LibraryStoryNode = {
  id: string;
  revision: number;
  content: StoryNodeContent;
  shared: boolean;
};
export const libraryCommandSchema = z
  .object({
    idempotencyKey: id,
    expectedRevision: z.number().int().min(0),
    content: storyNodeContentSchema,
  })
  .strict();
export const shareStoryNodeCommandSchema = z
  .object({ idempotencyKey: id, revision: z.number().int().positive() })
  .strict();

export function contentOf(storyNode: StoryNode): StoryNodeContent {
  return storyNodeContentSchema.parse({
    title: storyNode.title,
    transcript: storyNode.transcript,
    storyNodeType: storyNode.storyNodeType,
    ...(storyNode.video ? { video: storyNode.video } : {}),
    ...(storyNode.videoAdvance ? { videoAdvance: storyNode.videoAdvance } : {}),
    ...(storyNode.image ? { image: storyNode.image } : {}),
    outputs: storyNode.choices.length
      ? storyNode.choices.map(({ id, label, hint }) => ({
          id,
          label,
          ...(hint ? { hint } : {}),
        }))
      : [{ id: "continue", label: "Continue" }],
  });
}
export function placeStoryNode(
  record: LibraryStoryNode,
  instanceId: string,
  target: string,
): StoryNode {
  const { outputs, ...content } = record.content;
  return {
    ...content,
    id: instanceId,
    kind: "scene",
    entryEffects: [],
    sourceStoryNode: { id: record.id, revision: record.revision },
    choices: outputs.map((output) => ({
      ...output,
      unavailableDisplay: "locked",
      costs: [],
      outcome: {
        kind: "direct",
        route: { targetStoryNodeId: target, effects: [] },
      },
    })),
  };
}
