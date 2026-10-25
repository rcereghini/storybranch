import { z } from "zod";
import { id } from "./index";

export const invitationCommandSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("policy"),
      idempotencyKey: id,
      expectedRevision: z.number().int().nonnegative(),
      invitationRequired: z.boolean(),
    })
    .strict(),
  z
    .object({
      action: z.literal("create"),
      idempotencyKey: id,
      maxClaims: z.number().int().min(1).max(1000),
      days: z.number().int().min(1).max(30),
    })
    .strict(),
  z
    .object({
      action: z.literal("disable"),
      idempotencyKey: id,
      invitationId: id,
      expectedRevision: z.number().int().positive(),
    })
    .strict(),
]);
export const redeemInvitationSchema = z
  .object({
    idempotencyKey: id,
    code: z
      .string()
      .trim()
      .regex(/^[a-f0-9]{48}$/),
  })
  .strict();
export type EntryPolicy = {
  version: 1;
  revision: number;
  invitationRequired: boolean;
};
export type StoryInvitation = {
  id: string;
  storyId: string;
  issuerUid: string;
  createdAt: number;
  expiresAt: number;
  maxClaims: number;
  claims: number;
  revision: number;
  disabled: boolean;
};
export type InvitationListing = {
  published: boolean;
  policy: EntryPolicy;
  items: StoryInvitation[];
  nextCursor: string | null;
};
export type StoryEntry = {
  invitationRequired: boolean;
  hasKey: boolean;
  canStart: boolean;
};
