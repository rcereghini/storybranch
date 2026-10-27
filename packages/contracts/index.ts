import { z } from "zod";
import {
  nodeInputsSchema,
  inputBindingsSchema,
  type NodeInputSnapshot,
  inputName,
  inputValueSchema,
  type InputValue,
} from "./branch-data";
export const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
export const statId = z.enum([
  "strength",
  "agility",
  "intellect",
  "resolve",
  "charisma",
]);
export type StatId = z.infer<typeof statId>;
export type Condition =
  | {
      kind: "input";
      input: string;
      op: "gte" | "lte" | "eq";
      value: InputValue;
    }
  | {
      kind: "roll";
      storyNodeId: string;
      op: "gte" | "lte" | "eq";
      value: number;
    }
  | { kind: "stat"; stat: StatId; op: "gte" | "lte" | "eq"; value: number }
  | {
      kind: "key";
      keyId: string;
      present: boolean;
      scope?: "run" | "story" | "import" | "account";
    }
  | { kind: "item"; itemId: string; op: "gte" | "lte" | "eq"; quantity: number }
  | { kind: "all" | "any"; conditions: Condition[] }
  | { kind: "not"; condition: Condition };
const namespaced = z
  .string()
  .regex(/^[a-z0-9-]+:[a-z0-9-]+$/)
  .max(100);
const integer = z.number().int().min(0).max(999);
function conditionAt(depth: number): z.ZodType<Condition> {
  const leaf = [
    z
      .object({
        kind: z.literal("input"),
        input: inputName,
        op: z.enum(["gte", "lte", "eq"]),
        value: inputValueSchema,
      })
      .strict()
      .refine(
        (c) => c.op === "eq" || typeof c.value === "number",
        "Only integer inputs support ordered comparisons.",
      ),
    z
      .object({
        kind: z.literal("roll"),
        storyNodeId: id,
        op: z.enum(["gte", "lte", "eq"]),
        value: integer,
      })
      .strict(),
    z
      .object({
        kind: z.literal("stat"),
        stat: statId,
        op: z.enum(["gte", "lte", "eq"]),
        value: integer,
      })
      .strict(),
    z
      .object({
        kind: z.literal("key"),
        keyId: namespaced,
        present: z.boolean(),
        scope: z.enum(["run", "story", "import", "account"]).optional(),
      })
      .strict(),
    z
      .object({
        kind: z.literal("item"),
        itemId: namespaced,
        op: z.enum(["gte", "lte", "eq"]),
        quantity: integer,
      })
      .strict(),
  ] as const;
  return depth === 0
    ? z.union(leaf)
    : z.union([
        ...leaf,
        z
          .object({
            kind: z.enum(["all", "any"]),
            conditions: z
              .array(conditionAt(depth - 1))
              .min(1)
              .max(10),
          })
          .strict(),
        z
          .object({ kind: z.literal("not"), condition: conditionAt(depth - 1) })
          .strict(),
      ]);
}
export const conditionSchema = conditionAt(5);
export const effectSchema = z.discriminatedUnion("kind", [
  z
    .object({
      id,
      kind: z.literal("key"),
      keyId: namespaced,
      present: z.boolean(),
    })
    .strict(),
  z
    .object({
      id,
      kind: z.literal("item"),
      itemId: namespaced,
      delta: z.number().int().min(-99).max(99),
    })
    .strict(),
  z
    .object({
      id,
      kind: z.literal("stat"),
      stat: statId,
      delta: z.number().int().min(-20).max(20),
    })
    .strict(),
  z
    .object({
      id,
      kind: z.literal("health"),
      delta: z.number().int().min(-100).max(100),
    })
    .strict(),
  z
    .object({ id, kind: z.literal("milestone"), milestoneId: namespaced })
    .strict(),
  // Quiz points toward a result; only a reveal StoryNode reads them.
  z
    .object({
      id,
      kind: z.literal("score"),
      scoreId: namespaced,
      delta: z.number().int().min(-20).max(20),
    })
    .strict(),
]);
export const storyRouteSchema = z
  .object({
    targetStoryNodeId: id,
    effects: z.array(effectSchema).max(20),
    inputBindings: inputBindingsSchema.optional(),
  })
  .strict();
const route = storyRouteSchema;
export const choiceSchema = z
  .object({
    id,
    label: z.string().min(1).max(160),
    hint: z.string().max(200).optional(),
    availableWhen: conditionSchema.optional(),
    unavailableDisplay: z.enum(["locked", "hidden"]),
    costs: z.array(z.object({ itemId: namespaced, quantity: integer })).max(20),
    outcome: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("direct"), route }).strict(),
      z
        .object({
          kind: z.literal("dice"),
          sides: z.number().int().min(2).max(100),
          target: z.number().int().min(1).max(100),
          success: route,
          failure: route,
        })
        .strict(),
      z
        .object({
          kind: z.literal("check"),
          condition: conditionSchema,
          success: route,
          failure: route,
        })
        .strict(),
      // The server follows the result with the most points; a tie goes to
      // the first listed.
      z
        .object({
          kind: z.literal("reveal"),
          results: z
            .array(z.object({ scoreId: namespaced, route }).strict())
            .min(2)
            .max(12),
        })
        .strict(),
    ]),
  })
  .strict();
const assetImage = z.string().regex(/^asset:[a-zA-Z0-9_-]{8,80}$/);
// A comic is a square grid of 4 or 9 panels, or a scrolling strip of 4–12.
// Drafts may hold fewer panels and panels without images; publication checks.
export const comicLimits = { grid: [4, 9], scroll: [4, 12] } as const;
export const comicSchema = z
  .object({
    layout: z.enum(["grid", "scroll"]),
    panels: z
      .array(
        z
          .object({
            id,
            image: assetImage.optional(),
            // Caption or dialogue, shown over the image rather than baked in.
            caption: z.string().max(200).optional(),
            // What the panel shows: alt text, and the seed of its image prompt.
            alt: z.string().max(400).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(comicLimits.scroll[1]),
  })
  .strict();
export type Comic = z.infer<typeof comicSchema>;
export const leafRewardSchema = z
  .object({
    keyId: namespaced,
    label: z.string().trim().min(1).max(80),
  })
  .strict();
export const storyLeafSchema = z
  .object({
    version: z.literal(1),
    summary: z.string().max(1000),
    rewards: z
      .array(leafRewardSchema)
      .max(20)
      .refine(
        (rewards) =>
          new Set(rewards.map((r) => r.keyId)).size === rewards.length,
        "StoryLeaf reward keys must be unique.",
      ),
  })
  .strict();
export const completionSchema = z
  .object({
    version: z.literal(1),
    storyNodeId: id,
    revision: z.number().int().nonnegative(),
    at: z.number().finite(),
    storyKeys: z
      .array(
        z
          .object({ keyId: namespaced, label: z.string().min(1).max(80) })
          .strict(),
      )
      .max(40)
      .optional(),
    accountAchievement: z
      .object({ id, title: z.string().max(80), newlyGranted: z.boolean() })
      .strict()
      .optional(),
    summary: z.string().max(1000),
    rewards: z
      .array(leafRewardSchema.extend({ newlyGranted: z.boolean() }))
      .max(20),
  })
  .strict();
export type StoryCompletion = z.infer<typeof completionSchema>;
export const storyNodeSchema = z
  .object({
    id,
    inputs: nodeInputsSchema.optional(),
    title: z.string().max(160),
    transcript: z.string().max(10000),
    kind: z.enum(["scene", "ending"]),
    leaf: storyLeafSchema.optional(),
    storyNodeType: z.enum([
      "text",
      "text-options",
      "video",
      "video-options",
      "dice",
      "reveal",
      "comic",
    ]),
    videoAdvance: z.enum(["auto", "continue"]).optional(),
    image: assetImage.optional(),
    comic: comicSchema.optional(),
    sourceStoryNode: z
      .object({ id, revision: z.number().int().positive() })
      .strict()
      .optional(),
    // A shipped clip path, or `asset:<id>` for a creator's uploaded clip.
    video: z
      .string()
      .regex(/^(\/media\/[a-z0-9.-]+|asset:[a-zA-Z0-9_-]{8,80})$/)
      .optional(),
    entryEffects: z.array(effectSchema).max(20),
    choices: z.array(choiceSchema).max(20),
    checkpoint: z.boolean().optional(),
    branchLocation: id.optional(),
  })
  .strict();
export const storyTrunkContextSchema = z
  .object({
    version: z.literal(1),
    initialKeys: z
      .array(namespaced)
      .max(40)
      .refine(
        (keys) => new Set(keys).size === keys.length,
        "Starting keys must be unique.",
      ),
  })
  .strict();
export const itemCatalogueSchema = z
  .object({
    version: z.literal(1),
    items: z
      .array(
        z
          .object({
            itemId: namespaced,
            name: z.string().trim().min(1).max(80),
            description: z.string().max(500),
          })
          .strict(),
      )
      .max(100)
      .refine(
        (items) => new Set(items.map((i) => i.itemId)).size === items.length,
        "Item IDs must be unique.",
      ),
  })
  .strict();
export const storySchema = z
  .object({
    id,
    versionId: id,
    rulesetVersion: z.literal("prototype-1"),
    title: z.string(),
    entryStoryNodeId: id,
    trunkContext: storyTrunkContextSchema.optional(),
    itemCatalogue: itemCatalogueSchema.optional(),
    runKeyExports: z
      .object({
        version: z.literal(1),
        keys: z
          .array(
            z
              .object({
                keyId: namespaced,
                label: z.string().trim().min(1).max(80),
                exportToStoryIds: z
                  .array(id)
                  .max(20)
                  .refine(
                    (ids) => new Set(ids).size === ids.length,
                    "Export destinations must be unique.",
                  ),
              })
              .strict(),
          )
          .max(20)
          .refine(
            (keys) => new Set(keys.map((k) => k.keyId)).size === keys.length,
            "Run export keys must be unique.",
          ),
      })
      .strict()
      .optional(),
    accountKeys: z
      .object({
        version: z.literal(1),
        keys: z
          .array(
            z
              .object({
                keyId: namespaced,
                label: z.string().trim().min(1).max(80),
                definitionId: id,
                source: z.enum(["promotional", "achievement"]).optional(),
              })
              .strict(),
          )
          .max(20)
          .refine(
            (keys) => new Set(keys.map((k) => k.keyId)).size === keys.length,
            "Account aliases must be unique.",
          ),
      })
      .strict()
      .optional(),
    keyImports: z
      .object({
        version: z.literal(1),
        keys: z
          .array(
            z
              .object({
                keyId: namespaced,
                label: z.string().trim().min(1).max(80),
                sourceStoryId: id,
                sourceVersionId: id,
                sourceKeyId: namespaced,
                selection: z.enum(["ever-earned", "completed-run"]).optional(),
                required: z.boolean(),
              })
              .strict(),
          )
          .max(20)
          .refine(
            (keys) => new Set(keys.map((k) => k.keyId)).size === keys.length,
            "Imported key aliases must be unique.",
          ),
      })
      .strict()
      .optional(),
    progression: z
      .object({
        version: z.literal(1),
        keys: z
          .array(
            z
              .object({
                keyId: namespaced,
                label: z.string().trim().min(1).max(80),
                afterCompletions: z.number().int().min(1).max(999).optional(),
                achievementStoryNodeId: id.optional(),
                exportToStoryIds: z
                  .array(id)
                  .max(20)
                  .refine(
                    (ids) => new Set(ids).size === ids.length,
                    "Export destinations must be unique.",
                  )
                  .optional(),
              })
              .strict()
              .refine(
                (k) =>
                  (k.afterCompletions !== undefined) !==
                  (k.achievementStoryNodeId !== undefined),
                "Choose exactly one persistent key trigger.",
              ),
          )
          .max(40)
          .refine(
            (keys) => new Set(keys.map((k) => k.keyId)).size === keys.length,
            "Persistent keys must be unique.",
          ),
      })
      .strict()
      .optional(),
    storyNodes: z.record(storyNodeSchema),
  })
  .strict()
  .refine(
    (story) =>
      (story.itemCatalogue?.items ?? []).every((item) =>
        item.itemId.startsWith(story.id + ":"),
      ),
    "Catalogue items must belong to this Story's namespace.",
  );
export type Story = z.infer<typeof storySchema>;
export type Choice = z.infer<typeof choiceSchema>;
export type Effect = z.infer<typeof effectSchema>;
export type Stats = Record<StatId, number>;
export type StoryNode = Story["storyNodes"][string];
export type StoryNodeOutput = {
  choiceId: string;
  action?: "roll" | "continue";
};
export type StoryUser = {
  id: string;
  stats: Stats;
  achievements: string[];
  saveSpots: Array<{ id: string; storyId: string; storyNodeId: string }>;
};
export type StoryNodeInput = {
  storyNode: StoryNode;
  context: Save;
  user: StoryUser;
};
export type LocalState = {
  stats: Stats;
  keys: string[];
  items: Record<string, number>;
  health: number;
  milestones: string[];
  appliedEntryEffects: string[];
  // Absent on saves made before quizzes existed.
  scores?: Record<string, number>;
};
export type Save = LocalState & {
  nodeInputs?: NodeInputSnapshot;
  id: string;
  playerUid: string;
  storyId: string;
  versionId: string;
  rulesetVersion: string;
  storyNodeId: string;
  revision: number;
  status: "active" | "completed";
  statsSnapshot: Stats;
  parentPlaythroughId: string | null;
  parentRevision: number | null;
  updatedAt: number;
  completion?: StoryCompletion;
  // Server-only starting facts; never refreshed from another active run.
  storyProgressSnapshot?: { version: 1; keys: string[] };
  keyImportSnapshot?: {
    version: 1;
    consented: boolean;
    at: number;
    keys: Array<{
      keyId: string;
      present: boolean;
      sourceStoryId: string;
      sourceVersionId: string;
      sourceKeyId: string;
      grant?: { runId: string; versionId: string; at: number };
      sourceRun?: {
        runId: string;
        revision: number;
        completedAt: number;
        storyNodeId: string;
      };
    }>;
  };
  lastRoll?: {
    storyNodeId: string;
    value: number;
    sides: number;
    target: number;
    passed: boolean;
    pending: boolean;
  };
};
const sourceRunsSchema = z
  .array(
    z.object({ sourceStoryId: id, sourceVersionId: id, runId: id }).strict(),
  )
  .max(20)
  .refine(
    (runs) =>
      new Set(runs.map((r) => `${r.sourceStoryId}/${r.sourceVersionId}`))
        .size === runs.length,
    "Choose one run per source Story edition.",
  )
  .optional();
export const startSchema = z
  .object({
    idempotencyKey: id,
    payload: z
      .object({
        storyId: id,
        versionId: id.optional(),
        importConsent: z.boolean().optional(),
        sourceRuns: sourceRunsSchema,
      })
      .strict(),
  })
  .strict()
  .refine(
    (c) =>
      !c.payload.sourceRuns?.length ||
      (c.payload.importConsent === true && !!c.payload.versionId),
    "Selected source runs require consent and a pinned destination edition.",
  );
export type SourceRunSelection = NonNullable<
  z.infer<typeof startSchema>["payload"]["sourceRuns"]
>[number];
export const choiceCommandSchema = z
  .object({
    idempotencyKey: id,
    expectedRevision: z.number().int().min(0).max(99999999),
    payload: z
      .object({ choiceId: id, action: z.enum(["roll", "continue"]).optional() })
      .strict(),
  })
  .strict();
export const branchCommandSchema = z
  .object({
    idempotencyKey: id,
    expectedRevision: z.number().int().min(0).max(99999999),
    payload: z
      .object({
        branchId: id,
        storyId: id.optional(),
        versionId: id.optional(),
        importConsent: z.boolean().optional(),
        sourceRuns: sourceRunsSchema,
      })
      .strict(),
  })
  .strict()
  .refine(
    (c) =>
      (c.payload.importConsent === undefined ||
        (!!c.payload.versionId && !!c.payload.storyId)) &&
      (!c.payload.sourceRuns?.length ||
        (c.payload.importConsent === true && !!c.payload.versionId)),
    "Imported keys require consent and a pinned destination edition.",
  );
export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_FAILED"
  | "STALE_REVISION"
  | "IDEMPOTENCY_CONFLICT"
  | "UNAVAILABLE";
export class GameError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}
