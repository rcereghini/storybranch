import { z } from "zod";
import { id, storyNodeSchema, type Save, type StoryUser } from "./index";
import type { SceneMedia } from "./media";

export const playerContractHeader = "X-Story-Player";
export const playerContractVersion = "player-view-v1";
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
  storyNode: RenderStoryNode;
  media?: SceneMedia;
  nextMedia?: SceneMedia;
  image?: string;
  panels?: Array<string | undefined>;
  result?: boolean;
  branches: Array<{ id: string; title: string; author: string }>;
  featuredId: string | null;
};
