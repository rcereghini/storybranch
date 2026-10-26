import { z } from "zod";
import { id } from "./index";
export const promotionalCommandSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("create"),
      idempotencyKey: id,
      definitionId: id,
      label: z.string().trim().min(1).max(80),
      storyIds: z
        .array(id)
        .min(1)
        .max(20)
        .refine((ids) => new Set(ids).size === ids.length),
      days: z.number().int().min(1).max(365),
      redemptionDays: z.number().int().min(1).max(30),
      maxClaims: z.number().int().min(1).max(1000),
    })
    .strict(),
  z
    .object({
      action: z.literal("revoke"),
      idempotencyKey: id,
      definitionId: id,
      expectedRevision: z.number().int().positive(),
    })
    .strict(),
]);
export const promotionalRedemptionSchema = z
  .object({
    idempotencyKey: id,
    code: z
      .string()
      .trim()
      .regex(/^[a-f0-9]{48}$/),
  })
  .strict();
export type PromotionalDefinition = {
  id: string;
  label: string;
  storyIds: string[];
  expiresAt: number;
  redeemBy: number;
  maxClaims: number;
  claims: number;
  revoked: boolean;
  revision: number;
};
export type PromotionalGrant = {
  definitionId: string;
  label: string;
  grantedAt: number;
  expiresAt: number | null;
  status: "active" | "expired" | "revoked" | "unavailable";
};
export type PromotionalListing<T> = { items: T[]; nextCursor: string | null };
