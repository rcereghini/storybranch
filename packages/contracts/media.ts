import { z } from "zod";
import { id } from "./index";
const localAsset = z.string().regex(/^\/media\/[a-z0-9.-]+$/);
// Uploaded clips play from Firebase Storage download URLs (or its local emulator).
const storedAsset = z
  .string()
  .max(600)
  .regex(
    /^(https:\/\/firebasestorage\.googleapis\.com|http:\/\/127\.0\.0\.1:\d{2,5})\/v0\/b\/[a-z0-9.-]+\/o\/[A-Za-z0-9%._-]+\?alt=media&token=[a-f0-9-]{36}$/,
  );
const rendition = z
  .object({
    src: z.union([localAsset, storedAsset]),
    poster: localAsset.optional(),
    type: z.enum(["video/webm", "video/mp4"]),
  })
  .strict();
// Presentation renditions are separate from immutable story graphs and save state.
export const mediaSchema = z
  .object({
    landscape: rendition,
    portrait: rendition.optional(),
    socialClip: rendition.optional(),
    captions: localAsset.optional(),
  })
  .strict();
export type SceneMedia = z.infer<typeof mediaSchema>;

export const uploadLimits = {
  maxBytes: 100 * 1024 * 1024,
  maxSeconds: 60,
  maxAssets: 50,
} as const;
export const videoTypes = ["video/mp4", "video/webm"] as const;
export const imageTypes = ["image/jpeg", "image/png", "image/webp"] as const;
export const assetTypes = [...videoTypes, ...imageTypes] as const;
export const uploadCommandSchema = z
  .object({
    idempotencyKey: id,
    fileName: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .regex(/^[^\p{C}/\\]+$/u, "File names cannot contain slashes."),
    contentType: z.enum(assetTypes),
    bytes: z.number().int().min(1).max(uploadLimits.maxBytes),
    // Read from the file by the browser; informational, not verified.
    durationSeconds: z.number().min(0).max(uploadLimits.maxSeconds),
  })
  .strict()
  .superRefine((asset, ctx) => {
    if (asset.contentType.startsWith("video/") && asset.durationSeconds <= 0)
      ctx.addIssue({
        code: "custom",
        message: "Video duration must be positive.",
      });
    if (
      asset.contentType.startsWith("image/") &&
      (asset.durationSeconds !== 0 || asset.bytes > 10 * 1024 * 1024)
    )
      ctx.addIssue({
        code: "custom",
        message: "Images must be at most 10 MB with zero duration.",
      });
  });
export type UploadCommand = z.infer<typeof uploadCommandSchema>;
// What a creator sees about their own uploaded clip.
export type ClipAsset = {
  id: string;
  fileName: string;
  contentType: (typeof assetTypes)[number];
  bytes: number;
  durationSeconds: number;
  status: "pending" | "ready";
  published: boolean;
  createdAt: number;
  // Present once ready; only ever sent to the owner or for published pages.
  media?: SceneMedia;
  url?: string;
};
export type UploadListing = {
  enabled: boolean;
  reason: string | null;
  items: ClipAsset[];
};
export const assetRef = (assetId: string) => `asset:${assetId}`;
export const assetIdOf = (video: string | undefined) =>
  video?.startsWith("asset:") ? video.slice(6) : null;
