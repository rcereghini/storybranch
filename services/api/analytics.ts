import {
  analyticsDays,
  type SiteAnalytics,
} from "../../packages/contracts/analytics";
import { siteAnalytics } from "../../packages/domain/analytics";
import { GameError } from "../../packages/contracts/index";
import { allUsers } from "./admin-users";
import { db } from "./firebase";

// Built on request from account metadata and every saved playthrough, and
// kept for five minutes. Saves are read with only the fields needed; past
// the cap the page says the numbers are partial (then per-day totals, like
// AI usage, would be the next step).
const maxSaves = 20000;
const cacheMs = 300000;
const cache = new Map<number, { at: number; value: SiteAnalytics }>();

export async function analytics(days: number): Promise<SiteAnalytics> {
  if (!(analyticsDays as readonly number[]).includes(days))
    throw new GameError("VALIDATION_FAILED", "Choose 30 or 90 days.");
  const hit = cache.get(days);
  if (hit && Date.now() - hit.at < cacheMs) return hit.value;
  const [users, saves, catalogue] = await Promise.all([
    allUsers(),
    db
      .collectionGroup("playthroughs")
      .select("playerUid", "storyId", "status", "updatedAt")
      .limit(maxSaves + 1)
      .get(),
    db.collection("catalogue").get(),
  ]);
  const value = siteAnalytics({
    now: Date.now(),
    days,
    accounts: users.map((u) => ({
      createdAt: u.createdAt ? Date.parse(u.createdAt) : null,
      lastActiveAt: u.lastActive ? Date.parse(u.lastActive) : null,
    })),
    saves: saves.docs.slice(0, maxSaves).flatMap((d) => {
      const s = d.data();
      return typeof s.storyId === "string" && typeof s.playerUid === "string"
        ? [
            {
              playerUid: s.playerUid,
              storyId: s.storyId,
              status: String(s.status),
              updatedAt: typeof s.updatedAt === "number" ? s.updatedAt : 0,
            },
          ]
        : [];
    }),
    listings: catalogue.docs.map((d) => ({
      id: d.id,
      title: (d.data().title as string | undefined) ?? d.id,
      hidden: d.data().hidden === true,
    })),
    savesCapped: saves.size > maxSaves,
  });
  cache.set(days, { at: Date.now(), value });
  return value;
}
