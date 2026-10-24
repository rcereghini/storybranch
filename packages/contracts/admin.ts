import { z } from "zod";
import { id } from "./index";
import { featureId, type Features } from "./profile";
import { accountLimitsSchema, type AccountLimits } from "./settings";
import type { AiUsageTotals } from "./usage";
import type { EmailLogEntry } from "./email";

// Admin commands. Each is idempotent by key and recorded in the audit log.
export const adminUserCommandSchema = z
  .object({
    idempotencyKey: id,
    features: z.record(featureId, z.boolean()).optional(),
    status: z.enum(["active", "disabled"]).optional(),
    // The person's own daily limits; null returns one to the default.
    limits: accountLimitsSchema.optional(),
    // Clears today's counts, so they can use their full limit again.
    resetToday: z
      .array(z.enum(["ai", "images"]))
      .min(1)
      .max(2)
      .optional(),
  })
  .strict()
  .refine(
    (c) =>
      c.features !== undefined ||
      c.status !== undefined ||
      c.limits !== undefined ||
      c.resetToday !== undefined,
    { message: "Change at least one setting for this account." },
  );
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
  // When a signed-in session last refreshed: when they last used the app.
  lastActive: string | null;
};
export const adminUserStatuses = [
  "all",
  "active",
  "disabled",
  "no-profile",
] as const;
export const adminUsersQuerySchema = z
  .object({
    // Matches email, display name or ID, ignoring case.
    q: z.string().trim().max(120).default(""),
    status: z.enum(adminUserStatuses).default("all"),
    feature: featureId.optional(),
    cursor: z.coerce.number().int().min(0).default(0),
  })
  .strict();
export type AdminUsersQuery = z.infer<typeof adminUsersQuerySchema>;
export type AdminUsersPage = {
  items: AdminUser[];
  // Accounts matching the search and filters.
  total: number;
  // Accounts considered; at most the first 10,000 sign-ups.
  scanned: number;
  nextCursor: number | null;
};
export type AdminUserDetail = {
  user: AdminUser & {
    emailVerified: boolean;
    // Sign-in methods, such as "password" or "google.com".
    providers: string[];
    // Firebase sign-in is blocked (set when the account is disabled).
    signInBlocked: boolean;
  };
  limits: {
    own: AccountLimits;
    // What applies today: their own limits, else the Settings defaults.
    effective: { aiRequestsPerDay: number; imagesPerDay: number };
    // The Settings defaults, which apply where own is null.
    defaults: { aiRequestsPerDay: number; imagesPerDay: number };
    usedToday: { ai: number; images: number };
  };
  stories: Array<{ id: string; title: string; hidden: boolean }>;
  drafts: { count: number; titles: string[] };
  playthroughs: number;
  usage30d: AiUsageTotals;
  emails: EmailLogEntry[];
  // Admin changes to this account, newest first.
  audit: AdminAuditEntry[];
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
