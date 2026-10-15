import { z } from "zod";
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
  | { kind: "roll"; pageId: string; op: "gte" | "lte" | "eq"; value: number }
  | { kind: "stat"; stat: StatId; op: "gte" | "lte" | "eq"; value: number }
  | { kind: "key"; keyId: string; present: boolean }
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
        kind: z.literal("roll"),
        pageId: id,
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
]);
const route = z
  .object({ targetPageId: id, effects: z.array(effectSchema).max(20) })
  .strict();
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
    ]),
  })
  .strict();
export const pageSchema = z
  .object({
    id,
    title: z.string().max(160),
    transcript: z.string().max(10000),
    kind: z.enum(["scene", "ending"]),
    pageType: z.enum([
      "text",
      "text-options",
      "video",
      "video-options",
      "dice",
    ]),
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
export const storySchema = z
  .object({
    id,
    versionId: id,
    rulesetVersion: z.literal("prototype-1"),
    title: z.string(),
    entryPageId: id,
    pages: z.record(pageSchema),
  })
  .strict();
export type Story = z.infer<typeof storySchema>;
export type Choice = z.infer<typeof choiceSchema>;
export type Effect = z.infer<typeof effectSchema>;
export type Stats = Record<StatId, number>;
export type StoryPage = Story["pages"][string];
export type PageOutput = { choiceId: string; action?: "roll" | "continue" };
export type StoryUser = {
  id: string;
  stats: Stats;
  achievements: string[];
  saveSpots: Array<{ id: string; storyId: string; pageId: string }>;
};
export type PageInput = { page: StoryPage; context: Save; user: StoryUser };
export type LocalState = {
  stats: Stats;
  keys: string[];
  items: Record<string, number>;
  health: number;
  milestones: string[];
  appliedEntryEffects: string[];
};
export type Save = LocalState & {
  id: string;
  playerUid: string;
  storyId: string;
  versionId: string;
  rulesetVersion: string;
  pageId: string;
  revision: number;
  status: "active" | "completed";
  statsSnapshot: Stats;
  parentPlaythroughId: string | null;
  parentRevision: number | null;
  updatedAt: number;
  lastRoll?: {
    pageId: string;
    value: number;
    sides: number;
    target: number;
    passed: boolean;
    pending: boolean;
  };
};
export const startSchema = z
  .object({
    idempotencyKey: id,
    payload: z.object({ storyId: id, versionId: id.optional() }).strict(),
  })
  .strict();
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
    payload: z.object({ branchId: id }).strict(),
  })
  .strict();
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
