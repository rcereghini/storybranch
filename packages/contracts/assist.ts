import { z } from "zod";
import { id } from "./index";

// Studio's AI writing help. The browser sends the story context it is
// editing (it may be unsaved); the reply is only a suggestion, applied by the
// creator through Studio's normal, revision-checked save.
export const assistActions = [
  "write",
  "rewrite",
  "choices",
  "image-prompt",
] as const;
export const assistLimits = { maxChoices: 3 } as const;

const pageContext = z
  .object({
    title: z.string().max(160),
    text: z.string().max(10000),
  })
  .strict();

export const assistCommandSchema = z
  .object({
    idempotencyKey: id,
    action: z.enum(assistActions),
    // For rewrite: how to change the text ("shorter", "more suspense", …).
    instruction: z.string().trim().max(300).optional(),
    story: z
      .object({
        title: z.string().max(160),
        description: z.string().max(500),
      })
      .strict(),
    page: pageContext
      .extend({
        pageType: z.enum([
          "text",
          "text-options",
          "video",
          "video-options",
          "dice",
          "reveal",
          "comic",
        ]),
        ending: z.boolean(),
        // Labels of the page's existing outputs, for continuity.
        outputs: z.array(z.string().max(160)).max(20),
      })
      .strict(),
    // Up to three pages that lead here, nearest first.
    before: z.array(pageContext).max(3),
  })
  .strict();
export type AssistCommand = z.infer<typeof assistCommandSchema>;

export type AssistChoice = { label: string; title: string; text: string };
export type AssistResult =
  | { action: "write" | "rewrite"; text: string }
  | { action: "choices"; choices: AssistChoice[] }
  | { action: "image-prompt"; prompt: string };
