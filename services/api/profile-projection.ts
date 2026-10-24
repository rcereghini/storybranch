import type { Stats } from "../../packages/contracts/index";
import {
  accentId,
  avatarId,
  avatarTint,
  bannerId,
  bio,
  displayName,
  favoriteGenres,
  frameId,
  profileDefaults,
  tagline,
  accountFeatures,
  type PlayerProfile,
} from "../../packages/contracts/profile";
import { usableFeatures, writingHelpUsable } from "./access";
import type { AppSettings } from "../../packages/contracts/settings";
import type { ZodType } from "zod";

const or = <T>(schema: ZodType<T>, value: unknown, fallback: T): T => {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : fallback;
};

// Profiles created before a field existed (or holding an invalid value)
// fall back to defaults; nothing is written back.
export function projectProfile(
  uid: string,
  data: Record<string, unknown>,
  settings: AppSettings,
  tokenName?: string,
): PlayerProfile {
  return {
    id: uid,
    displayName: or(displayName, data.displayName ?? tokenName, "Player"),
    avatarId: or(avatarId, data.avatarId, profileDefaults.avatarId),
    tagline: or(tagline, data.tagline, profileDefaults.tagline),
    bio: or(bio, data.bio, profileDefaults.bio),
    bannerId: or(bannerId, data.bannerId, profileDefaults.bannerId),
    accent: or(accentId, data.accent, profileDefaults.accent),
    avatarTint: or(avatarTint, data.avatarTint, profileDefaults.avatarTint),
    avatarFrame: or(frameId, data.avatarFrame, profileDefaults.avatarFrame),
    favoriteGenres: or(favoriteGenres, data.favoriteGenres, []),
    stats: data.stats as Stats,
    achievements: Array.isArray(data.achievements) ? data.achievements : [],
    features: usableFeatures(accountFeatures(data), settings),
    writingHelp: writingHelpUsable(accountFeatures(data), settings),
  };
}
