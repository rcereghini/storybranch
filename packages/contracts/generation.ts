import { z } from "zod";
import { id } from "./index";
import type { ClipAsset } from "./media";

export const generationCommand = z.discriminatedUnion("kind", [
  z
    .object({
      idempotencyKey: id,
      kind: z.literal("image"),
      prompt: z.string().trim().min(3).max(1800),
      referenceId: id.optional(),
    })
    .strict(),
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
export type GenerationJob = {
  id: string;
  status: "submitting" | "queued" | "ready" | "failed" | "uncertain";
  kind: "image" | "video";
  prompt: string;
  createdAt: number;
  message?: string;
  asset?: ClipAsset;
};
export type GenerationListing = {
  enabled: boolean;
  reason: string | null;
  jobs: GenerationJob[];
};
