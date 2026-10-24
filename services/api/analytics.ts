import {
  analyticsDays,
  type SiteAnalytics,
} from "../../packages/contracts/analytics";
import {
  siteAnalytics,
  type AnalyticsSave,
} from "../../packages/domain/analytics";
import { GameError } from "../../packages/contracts/index";
import { allUsers } from "./admin-users";
import { db } from "./firebase";

// Built on request from account metadata and every saved playthrough, and
// kept for five minutes. Saves are read with only the fields needed; past
// the cap the page says the numbers are partial (then per-day totals, like
// AI usage, would be the next step).
const maxSaves = 20000;
const cacheMs = 300000;
let savesCache: {
  at: number;
  saves: Array<AnalyticsSave & { versionId: string | null }>;
  capped: boolean;
} | null = null;

// Every saved playthrough's player, story, edition, status and last change,
// shared by Analytics and Stories.
export async function allSaves() {
  if (savesCache && Date.now() - savesCache.at < cacheMs) return savesCache;
  const docs = await db
    .collectionGroup("playthroughs")
    .select("playerUid", "storyId", "versionId", "status", "updatedAt")
    .limit(maxSaves + 1)
    .get();
  savesCache = {
    at: Date.now(),
    capped: docs.size > maxSaves,
    saves: docs.docs.slice(0, maxSaves).flatMap((d) => {
      const s = d.data();
      return typeof s.storyId === "string" && typeof s.playerUid === "string"
        ? [
            {
              playerUid: s.playerUid,
              storyId: s.storyId,
              versionId: typeof s.versionId === "string" ? s.versionId : null,
              status: String(s.status),
              updatedAt: typeof s.updatedAt === "number" ? s.updatedAt : 0,
            },
          ]
        : [];
    }),
  };
  return savesCache;
}

export async function analytics(days: number): Promise<SiteAnalytics> {
  if (!(analyticsDays as readonly number[]).includes(days))
    throw new GameError("VALIDATION_FAILED", "Choose 30 or 90 days.");
  const [users, saves, catalogue] = await Promise.all([
    allUsers(),
    allSaves(),
    db.collection("catalogue").get(),
  ]);
  return siteAnalytics({
    now: Date.now(),
    days,
    accounts: users.map((u) => ({
      createdAt: u.createdAt ? Date.parse(u.createdAt) : null,
      lastActiveAt: u.lastActive ? Date.parse(u.lastActive) : null,
    })),
    saves: saves.saves,
    listings: catalogue.docs.map((d) => ({
      id: d.id,
      title: (d.data().title as string | undefined) ?? d.id,
      hidden: d.data().hidden === true,
    })),
    savesCapped: saves.capped,
  });
}
