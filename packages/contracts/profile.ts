import { z } from "zod";
import type { Stats } from "./index";

// Built-in avatars only: players pick one, nothing is uploaded or moderated.
export const avatarIds = [
  "lantern",
  "compass",
  "key",
  "raven",
  "tide",
  "gear",
  "storm",
  "quill",
] as const;
export const avatarId = z.enum(avatarIds);
export type AvatarId = z.infer<typeof avatarId>;
export const defaultAvatarId: AvatarId = "lantern";

export const displayName = z
  .string()
  .trim()
  .min(1, "Enter a display name.")
  .max(32, "Display names are at most 32 characters.")
  .regex(/^[^\p{C}]+$/u, "Display names cannot contain control characters.");

export const profileUpdateSchema = z.object({ displayName, avatarId }).strict();
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;

// What the signed-in player sees about themselves; never another player.
export type PlayerProfile = {
  id: string;
  displayName: string;
  avatarId: AvatarId;
  stats: Stats;
  achievements: string[];
};

export type StoryProgress = {
  storyId: string;
  title: string;
  description: string;
  status: "not-started" | "in-progress" | "completed";
  // The most recent active main save, when the story is in progress.
  activeSaveId: string | null;
  endingsFound: number;
  endingsTotal: number;
};
export type ContinueEntry = {
  saveId: string;
  storyId: string;
  title: string;
  pageTitle: string;
  sideQuest: boolean;
  updatedAt: number;
};
export type EndingEntry = {
  saveId: string;
  storyId: string;
  title: string;
  pageTitle: string;
  at: number;
};
export type DashboardSummary = {
  totals: {
    started: number;
    completed: number;
    sideQuests: number;
    endingsFound: number;
    keys: number;
    milestones: number;
  };
  continue: ContinueEntry[];
  stories: StoryProgress[];
  recentEndings: EndingEntry[];
};
