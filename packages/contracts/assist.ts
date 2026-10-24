import { z } from "zod";
import { comicLimits, id } from "./index";
import { maxCast } from "./authoring";

// Studio's AI writing help. The browser sends the story context it is
// editing (it may be unsaved); the reply is only a suggestion, applied by the
// creator through Studio's normal, revision-checked save.
export const assistActions = [
  "write",
  "rewrite",
  "choices",
  "image-prompt",
  "comic-script",
] as const;
export const assistLimits = { maxChoices: 3 } as const;

// A comic written from a premise: the companion's script, which the creator
// reviews before anything is drawn. Panel descriptions name characters by
// their cast names, so Studio can pass the right reference images.
export const comicScriptSchema = z
  .object({
    title: z.string().max(160),
    description: z.string().max(500),
    cast: z
      .array(
        z
          .object({
            name: z.string().max(60),
            description: z.string().max(400),
          })
          .strict(),
      )
      .max(maxCast),
    panels: z
      .array(
        z
          .object({
            alt: z.string().max(400),
            caption: z.string().max(200),
          })
          .strict(),
      )
      .min(1)
      .max(comicLimits.scroll[1]),
  })
  .strict();
export type ComicScript = z.infer<typeof comicScriptSchema>;
export const comicBriefSchema = z
  .object({
    // The situation and the joke, in the creator's words.
    premise: z.string().trim().min(10).max(800),
    // The art style the creator picked, as prompt text.
    style: z.string().trim().max(300),
    layout: z.enum(["grid", "scroll"]),
    panelCount: z.number().int().min(4).max(comicLimits.scroll[1]),
    // A revision: the script so far and what to change.
    script: comicScriptSchema.optional(),
  })
  .strict()
  .refine(
    (b) =>
      b.layout === "scroll"
        ? b.panelCount <= comicLimits.scroll[1]
        : (comicLimits.grid as readonly number[]).includes(b.panelCount),
    "A square grid has 4 or 9 panels.",
  );
export type ComicBrief = z.infer<typeof comicBriefSchema>;

const storyNodeContext = z
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
    storyNode: storyNodeContext
      .extend({
        storyNodeType: z.enum([
          "text",
          "text-options",
          "video",
          "video-options",
          "dice",
          "reveal",
          "comic",
        ]),
        ending: z.boolean(),
        // Labels of the StoryNode's existing outputs, for continuity.
        outputs: z.array(z.string().max(160)).max(20),
      })
      .strict(),
    // Up to three StoryNodes that lead here, nearest first.
    before: z.array(storyNodeContext).max(3),
    comic: comicBriefSchema.optional(),
  })
  .strict()
  .refine(
    (c) => (c.action === "comic-script") === !!c.comic,
    "A comic script needs a comic brief, and only it.",
  );
export type AssistCommand = z.infer<typeof assistCommandSchema>;

export type AssistChoice = { label: string; title: string; text: string };
export type AssistResult =
  | { action: "write" | "rewrite"; text: string }
  | { action: "choices"; choices: AssistChoice[] }
  | { action: "image-prompt"; prompt: string }
  | { action: "comic-script"; script: ComicScript };

const cut = (text: unknown, max: number) =>
  String(text ?? "")
    .trim()
    .slice(0, max);
// Clamps a model's script to the brief: exactly the panels asked for, at most
// the cast Studio can hold, and every field within its limit. Null when the
// reply is unusable.
export function clampComicScript(
  raw: unknown,
  brief: ComicBrief,
): ComicScript | null {
  const value = (raw ?? {}) as Record<string, unknown>;
  const list = (x: unknown) =>
    (Array.isArray(x) ? x : []) as Record<string, unknown>[];
  const panels = list(value.panels)
    .map((p) => ({ alt: cut(p.alt, 400), caption: cut(p.caption, 200) }))
    .filter((p) => p.alt);
  if (panels.length < brief.panelCount) return null;
  const seen = new Set<string>();
  const cast = list(value.cast)
    .map((c) => ({
      name: cut(c.name, 60),
      description: cut(c.description, 400),
    }))
    .filter((c) => {
      const key = c.name.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, maxCast);
  return {
    title: cut(value.title, 160) || "Untitled comic",
    description: cut(value.description, 500),
    cast,
    panels: panels.slice(0, brief.panelCount),
  };
}
