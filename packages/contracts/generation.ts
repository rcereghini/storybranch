import { z } from "zod";
import { id } from "./index";
import type { ClipAsset } from "./media";

// Two image tiers: a quick, nearly free draft, and high quality, which can
// also follow up to three reference images from the creator's library.
export const imageQualities = ["draft", "high"] as const;
export const imageAspects = ["16:9", "9:16", "1:1"] as const;
export const maxReferences = 3;
const imageCommand = z
  .object({
    idempotencyKey: id,
    kind: z.literal("image"),
    prompt: z.string().trim().min(3).max(1800),
    quality: z.enum(imageQualities),
    aspect: z.enum(imageAspects),
    referenceIds: z.array(id).max(maxReferences).optional(),
  })
  .strict();
export const generationCommand = z.discriminatedUnion("kind", [
  imageCommand,
  // Video generation is turned off; the server refuses this kind.
  z
    .object({
      idempotencyKey: id,
      kind: z.literal("video"),
      prompt: z.string().trim().min(3).max(1800),
      firstId: id,
      lastId: id,
    })
    .strict(),
]);
export type GenerationCommand = z.infer<typeof generationCommand>;
export type ImageCommand = z.infer<typeof imageCommand>;
// Reference images steer only the high-quality model.
export const imageCommandProblem = (command: ImageCommand) =>
  command.quality === "draft" && command.referenceIds?.length
    ? "Reference images need High quality."
    : null;
export type GenerationJob = {
  id: string;
  status: "submitting" | "queued" | "ready" | "failed" | "uncertain";
  kind: "image" | "video";
  prompt: string;
  quality?: (typeof imageQualities)[number];
  aspect?: (typeof imageAspects)[number];
  createdAt: number;
  message?: string;
  asset?: ClipAsset;
};
export type GenerationListing = {
  enabled: boolean;
  reason: string | null;
  jobs: GenerationJob[];
};
