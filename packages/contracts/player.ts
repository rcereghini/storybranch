import { z } from "zod";
import {
  id,
  storyNodeSchema,
  completionSchema,
  type Save,
  type StoryUser,
} from "./index";
import type { SceneMedia } from "./media";

export const playerContractHeader = "X-Story-Player";
export const playerContractVersion = "player-view-v1";
const itemDisplaySchema = z.object({
  itemId: z
    .string()
    .regex(/^[a-z0-9-]+:[a-z0-9-]+$/)
    .max(100),
  name: z.string().min(1).max(100),
  description: z.string().max(500),
});
export const playerItemSchema = itemDisplaySchema.extend({
  quantity: z.number().int().min(1).max(999),
});
export const playerItemChangeSchema = itemDisplaySchema.extend({
  delta: z
    .number()
    .int()
    .min(-999)
    .max(999)
    .refine((n) => n !== 0),
});
export type PlayerItem = z.infer<typeof playerItemSchema>;
export const playerRollSchema = z.object({
  storyNodeId: id,
  value: z.number().int(),
  sides: z.number().int().positive(),
  target: z.number().int(),
  passed: z.boolean(),
  pending: z.boolean(),
});
export const playerEventSchema = z.object({
  label: z.string(),
  revision: z.number().int().nonnegative(),
  at: z.number(),
  from: id.nullable().optional(),
  to: id.optional(),
  outcome: z.string().optional(),
  roll: playerRollSchema.optional(),
  completion: completionSchema.optional(),
  itemChanges: z.array(playerItemChangeSchema).optional(),
});
export type PlayerEvent = z.infer<typeof playerEventSchema>;
export const renderStoryNodeSchema = storyNodeSchema
  .pick({
    id: true,
    title: true,
    transcript: true,
    kind: true,
    storyNodeType: true,
    video: true,
    videoAdvance: true,
    comic: true,
  })
  .extend({
    outputs: z
      .array(
        z
          .object({
            id,
            label: z.string(),
            hint: z.string().optional(),
            enabled: z.boolean(),
          })
          .strict(),
      )
      .max(20),
    diceSides: z.number().int().positive().optional(),
  })
  .strict();
export type RenderStoryNode = z.infer<typeof renderStoryNodeSchema>;
export type PlayerRun = Omit<Save, "scores" | "appliedEntryEffects">;
export type PlayerView = {
  story: { id: string; title: string; versionId: string };
  user: StoryUser;
  save: PlayerRun;
  inventory?: PlayerItem[];
  storyNode: RenderStoryNode;
  media?: SceneMedia;
  nextMedia?: SceneMedia;
  image?: string;
  panels?: Array<string | undefined>;
  result?: boolean;
  branches: Array<{ id: string; title: string; author: string }>;
  featuredId: string | null;
};
