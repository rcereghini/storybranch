import { battleResultSchema } from "./battle";
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
export const renderBattleSchema = z
  .object({
    version: z.literal(1),
    battleId: z.string().min(1).max(400),
    phase: z.enum(["active", "result-pending"]),
    turns: z.number().int().min(0).max(30),
    maxTurns: z.number().int().min(1).max(30),
    initiative: z.enum(["player", "enemy"]),
    playerHealth: z.number().int().min(0).max(100),
    playerMaxHealth: z.literal(100),
    enemy: z
      .object({
        name: z.string().min(1).max(80),
        health: z.number().int().min(0).max(100),
        maxHealth: z.number().int().min(1).max(100),
      })
      .strict(),
    actions: z
      .array(z.enum(["attack", "guard", "escape", "continue"]))
      .min(1)
      .max(3),
    result: battleResultSchema.optional(),
  })
  .strict()
  .superRefine((b, ctx) => {
    const expected =
      b.phase === "active" ? ["attack", "guard", "escape"] : ["continue"];
    if (
      JSON.stringify(b.actions) !== JSON.stringify(expected) ||
      (b.phase === "result-pending") !== !!b.result ||
      b.enemy.health > b.enemy.maxHealth ||
      b.turns > b.maxTurns
    )
      ctx.addIssue({ code: "custom", message: "Invalid battle presentation." });
  });
export type RenderBattle = z.infer<typeof renderBattleSchema>;
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
    storyNodeType: z.enum([
      "text",
      "video",
      "dice",
      "reveal",
      "text-options",
      "video-options",
      "comic",
      "battle",
    ]),
    battle: renderBattleSchema.optional(),
    outputs: z
      .array(
        z
          .object({
            id,
            label: z.string(),
            hint: z.string().optional(),
            enabled: z.boolean(),
            itemCosts: z
              .array(
                itemDisplaySchema
                  .pick({ itemId: true, name: true })
                  .extend({
                    required: z.number().int().min(1).max(19980),
                    owned: z.number().int().min(0).max(999),
                  })
                  .strict(),
              )
              .max(20)
              .optional(),
          })
          .strict(),
      )
      .max(20),
    diceSides: z.number().int().positive().optional(),
  })
  .strict()
  .superRefine((node, ctx) => {
    if (
      node.storyNodeType === "battle"
        ? !node.battle || node.kind !== "scene" || node.outputs.length !== 0
        : !!node.battle
    )
      ctx.addIssue({
        code: "custom",
        message: "Battle presentation must match its StoryNode type.",
      });
  });
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
