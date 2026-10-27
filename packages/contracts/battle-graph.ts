import { z } from "zod";
import { storySchema, storyNodeSchema } from "./index";
import { battleConfigSchema } from "./battle";
import { battleOutputsSchema } from "./battle-routing";

export const stagedBattleNodeSchema = storyNodeSchema
  .pick({
    id: true,
    title: true,
    transcript: true,
    inputs: true,
    entryEffects: true,
  })
  .extend({
    kind: z.literal("scene"),
    storyNodeType: z.literal("battle"),
    battle: battleConfigSchema,
    outputs: battleOutputsSchema,
  })
  .strict();
// Used by battle services and private drafts. Ordinary publication remains gated.
export const stagedBattleStorySchema = storySchema
  .innerType()
  .extend({
    storyNodes: z
      .record(z.union([stagedBattleNodeSchema, storyNodeSchema]))
      .refine(
        (nodes) => Object.keys(nodes).length <= 80,
        "At most 80 StoryNodes.",
      ),
  })
  .strict()
  .refine(
    (story) =>
      (story.itemCatalogue?.items ?? []).every((item) =>
        item.itemId.startsWith(story.id + ":"),
      ),
    "Catalogue items must belong to this Story's namespace.",
  );
export type StagedBattleStory = z.infer<typeof stagedBattleStorySchema>;
export type StagedBattleNode = z.infer<typeof stagedBattleNodeSchema>;
