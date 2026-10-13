import { z } from "zod";
const localAsset = z.string().regex(/^\/media\/[a-z0-9.-]+$/);
const rendition = z
  .object({
    src: localAsset,
    poster: localAsset,
    type: z.enum(["video/webm", "video/mp4"]),
  })
  .strict();
// Presentation renditions are separate from immutable story graphs and save state.
export const mediaSchema = z
  .object({
    landscape: rendition,
    portrait: rendition.optional(),
    socialClip: rendition.optional(),
    captions: localAsset,
  })
  .strict();
export type SceneMedia = z.infer<typeof mediaSchema>;
