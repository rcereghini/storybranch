import { z } from "zod";
import { id } from "./index";
export const achievementSubmissionSchema = z
  .object({
    idempotencyKey: id,
    expectedRevision: z.number().int().nonnegative(),
    storyId: id,
    versionId: id,
    storyNodeId: id,
    title: z.string().trim().min(1).max(80),
    description: z.string().trim().max(500),
  })
  .strict();
export const achievementReviewSchema = z
  .object({
    idempotencyKey: id,
    expectedRevision: z.number().int().positive(),
    status: z.enum(["approved", "rejected", "revoked"]),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();
export type AchievementDefinition = {
  ending: { title: string; transcript: string; storyNodeType: string };
  id: string;
  achievementId: string;
  creatorUid: string;
  storyId: string;
  versionId: string;
  storyNodeId: string;
  title: string;
  description: string;
  revision: number;
  status: "pending" | "approved" | "rejected" | "revoked";
  reviewReason: string;
  updatedAt: number;
};
export type AchievementClaim = {
  id: string;
  definitionId: string;
  definitionRevision: number;
  storyId: string;
  versionId: string;
  storyNodeId: string;
  runId: string;
  title: string;
  description: string;
  at: number;
};
