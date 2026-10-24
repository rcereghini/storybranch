import { z } from "zod";
import { id } from "./index";
import { featureId, type Features } from "./profile";

// Admin commands. Each is idempotent by key and recorded in the audit log.
export const adminUserCommandSchema = z
  .object({
    idempotencyKey: id,
    features: z.record(featureId, z.boolean()).optional(),
    status: z.enum(["active", "disabled"]).optional(),
  })
  .strict()
  .refine((c) => c.features !== undefined || c.status !== undefined, {
    message: "Change at least one feature or the account status.",
  });
export type AdminUserCommand = z.infer<typeof adminUserCommandSchema>;

export const adminStoryCommandSchema = z
  .object({ idempotencyKey: id, hidden: z.boolean() })
  .strict();
export type AdminStoryCommand = z.infer<typeof adminStoryCommandSchema>;

export type AdminOverview = {
  users: number;
  disabledUsers: number;
  admins: number;
  publishedStories: number;
  hiddenStories: number;
  drafts: number;
  playthroughs: number;
  // Claude calls plus returned images over the last 30 UTC days, and their
  // estimated cost at list prices (priced usage only).
  aiRequests30d: number;
  aiEstimatedUsd30d: number;
};
export type AdminUser = {
  uid: string;
  email: string | null;
  displayName: string;
  status: "active" | "disabled" | "no-profile";
  // Stored flags; admin implies every feature (see accountFeatures).
  features: Features;
  createdAt: string | null;
  lastSignIn: string | null;
};
export type AdminStory = {
  id: string;
  title: string;
  description: string;
  publishedVersionId: string | null;
  creatorUid: string | null;
  creatorEmail: string | null;
  hidden: boolean;
};
export type AdminAuditEntry = {
  id: string;
  at: number;
  actorUid: string;
  actorEmail: string | null;
  action: "user" | "story" | "email" | "settings";
  target: string;
  change: Record<string, unknown>;
};
