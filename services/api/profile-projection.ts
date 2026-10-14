import type { Stats } from "../../packages/contracts/index";
import {
  avatarId,
  defaultAvatarId,
  displayName,
  type PlayerProfile,
} from "../../packages/contracts/profile";

// Profiles created before display names/avatars existed fall back to defaults.
export function projectProfile(
  uid: string,
  data: Record<string, unknown>,
  tokenName?: string,
): PlayerProfile {
  const name = displayName.safeParse(data.displayName ?? tokenName);
  const avatar = avatarId.safeParse(data.avatarId);
  return {
    id: uid,
    displayName: name.success ? name.data : "Player",
    avatarId: avatar.success ? avatar.data : defaultAvatarId,
    stats: data.stats as Stats,
    achievements: Array.isArray(data.achievements) ? data.achievements : [],
  };
}
