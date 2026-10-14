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

// Fixed palettes keep every combination readable on the dark theme.
export const accentIds = [
  "teal",
  "violet",
  "amber",
  "rose",
  "sky",
  "lime",
] as const;
export const accentId = z.enum(accentIds);
export type AccentId = z.infer<typeof accentId>;
export const bannerIds = [
  "harbor",
  "clockwork",
  "storm",
  "aurora",
  "ember",
  "grove",
] as const;
export const bannerId = z.enum(bannerIds);
export type BannerId = z.infer<typeof bannerId>;
export const frameIds = ["circle", "rounded", "hexagon", "diamond"] as const;
export const frameId = z.enum(frameIds);
export type FrameId = z.infer<typeof frameId>;
// "preset" keeps the avatar's own color; otherwise one of the accents.
export const avatarTint = z.enum(["preset", ...accentIds]);
export type AvatarTint = z.infer<typeof avatarTint>;
export const genreIds = [
  "mystery",
  "fantasy",
  "sci-fi",
  "adventure",
  "horror",
  "romance",
  "comedy",
  "historical",
] as const;
export const genreId = z.enum(genreIds);
export type GenreId = z.infer<typeof genreId>;

export const displayName = z
  .string()
  .trim()
  .min(1, "Enter a display name.")
  .max(32, "Display names are at most 32 characters.")
  .regex(/^[^\p{C}]+$/u, "Display names cannot contain control characters.");
export const tagline = z
  .string()
  .trim()
  .max(80, "Taglines are at most 80 characters.")
  .regex(/^[^\p{C}]*$/u, "Taglines cannot contain control characters.");
// Plain text; line breaks are the only control characters allowed.
export const bio = z
  .string()
  .trim()
  .max(500, "Your bio can be at most 500 characters.")
  .regex(/^(?:[^\p{C}]|\n)*$/u, "Your bio cannot contain control characters.");
export const favoriteGenres = z
  .array(genreId)
  .max(5, "Pick up to five genres.")
  .refine(
    (g) => new Set(g).size === g.length,
    "Each genre can be picked once.",
  );

// Name and avatar are required; customizations are optional so older
// clients that only send those two keep working.
export const profileUpdateSchema = z
  .object({
    displayName,
    avatarId,
    tagline: tagline.optional(),
    bio: bio.optional(),
    bannerId: bannerId.optional(),
    accent: accentId.optional(),
    avatarTint: avatarTint.optional(),
    avatarFrame: frameId.optional(),
    favoriteGenres: favoriteGenres.optional(),
  })
  .strict();
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;

// What the signed-in player sees about themselves; never another player.
export type PlayerProfile = {
  id: string;
  displayName: string;
  avatarId: AvatarId;
  tagline: string;
  bio: string;
  bannerId: BannerId;
  accent: AccentId;
  avatarTint: AvatarTint;
  avatarFrame: FrameId;
  favoriteGenres: GenreId[];
  stats: Stats;
  achievements: string[];
};
export const profileDefaults = {
  avatarId: defaultAvatarId,
  tagline: "",
  bio: "",
  bannerId: "harbor",
  accent: "teal",
  avatarTint: "preset",
  avatarFrame: "circle",
  favoriteGenres: [],
} satisfies Partial<PlayerProfile>;

export type StoryProgress = {
  storyId: string;
  title: string;
  description: string;
  genre: string;
  duration: string;
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
export type ActivityEntry = {
  saveId: string;
  storyId: string;
  title: string;
  label: string;
  at: number;
};
export type Recommendation = {
  storyId: string;
  title: string;
  description: string;
  genre: string;
  reason: string;
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
  activity: ActivityEntry[];
  recommendations: Recommendation[];
};
