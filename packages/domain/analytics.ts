import type { AnalyticsStory, SiteAnalytics } from "../contracts/analytics";
import { dayKey, dayRange } from "./usage";

export type AnalyticsAccount = {
  createdAt: number | null;
  // When a signed-in session last refreshed: the best "last used" signal.
  lastActiveAt: number | null;
};
export type AnalyticsSave = {
  playerUid: string;
  storyId: string;
  status: string;
  updatedAt: number;
};
export type AnalyticsListing = { id: string; title: string; hidden: boolean };

const dayMs = 86400000;

export function siteAnalytics({
  now,
  days,
  accounts,
  saves,
  listings,
  savesCapped,
}: {
  now: number;
  days: number;
  accounts: AnalyticsAccount[];
  saves: AnalyticsSave[];
  listings: AnalyticsListing[];
  savesCapped: boolean;
}): SiteAnalytics {
  const range = dayRange(now, days);
  const start = Date.parse(`${range[0]}T00:00:00Z`);
  const signups = new Map(range.map((day) => [day, 0]));
  for (const a of accounts)
    if (a.createdAt !== null && a.createdAt >= start) {
      const day = dayKey(a.createdAt);
      if (signups.has(day)) signups.set(day, signups.get(day)! + 1);
    }
  const activeWithin = (ms: number) =>
    accounts.filter(
      (a) => a.lastActiveAt !== null && now - a.lastActiveAt <= ms,
    ).length;

  type Tally = {
    players: Set<string>;
    finishers: Set<string>;
    active: Set<string>;
    last: number | null;
  };
  const byStory = new Map<string, Tally>();
  const playersInPeriod = new Set<string>();
  for (const s of saves) {
    const t =
      byStory.get(s.storyId) ??
      byStory
        .set(s.storyId, {
          players: new Set(),
          finishers: new Set(),
          active: new Set(),
          last: null,
        })
        .get(s.storyId)!;
    t.players.add(s.playerUid);
    if (s.status === "completed") t.finishers.add(s.playerUid);
    if (s.updatedAt >= start) {
      t.active.add(s.playerUid);
      playersInPeriod.add(s.playerUid);
    }
    t.last = Math.max(t.last ?? 0, s.updatedAt);
  }
  // Catalogue stories first (including unplayed ones), then any other story
  // that has saves, such as community side quests.
  const titles = new Map(listings.map((l) => [l.id, l]));
  const ids = [
    ...listings.map((l) => l.id),
    ...[...byStory.keys()].filter((id) => !titles.has(id)),
  ];
  const stories: AnalyticsStory[] = ids
    .map((id) => {
      const t = byStory.get(id);
      const players = t?.players.size ?? 0;
      const finishers = t?.finishers.size ?? 0;
      return {
        id,
        title: titles.get(id)?.title ?? id,
        listed: titles.has(id),
        hidden: titles.get(id)?.hidden ?? false,
        players,
        finishers,
        completionRate: players ? finishers / players : null,
        activePlayers: t?.active.size ?? 0,
        lastPlayedAt: t?.last ?? null,
      };
    })
    .sort((a, b) => b.players - a.players || a.title.localeCompare(b.title));

  return {
    from: range[0],
    to: range.at(-1)!,
    accounts: accounts.length,
    signups: [...signups.values()].reduce((a, b) => a + b, 0),
    signupsByDay: range.map((day) => ({ day, count: signups.get(day)! })),
    active: {
      day: activeWithin(dayMs),
      week: activeWithin(7 * dayMs),
      month: activeWithin(30 * dayMs),
    },
    playersInPeriod: playersInPeriod.size,
    stories,
    savesRead: saves.length,
    savesCapped,
  };
}

export type StoryStats = {
  players: number;
  finishers: number;
  completionRate: number | null;
  // Players whose save changed in the last 30 days.
  recentPlayers: number;
  lastPlayedAt: number | null;
  // The same counts per published edition, by version ID.
  byEdition: Record<string, { players: number; finishers: number }>;
};

// One story's play, counting each account once (per edition, too).
export function storyStats(
  saves: Array<AnalyticsSave & { versionId: string | null }>,
  storyId: string,
  now: number,
): StoryStats {
  const players = new Set<string>();
  const finishers = new Set<string>();
  const recent = new Set<string>();
  const editions = new Map<
    string,
    { players: Set<string>; finishers: Set<string> }
  >();
  let last: number | null = null;
  for (const s of saves) {
    if (s.storyId !== storyId) continue;
    players.add(s.playerUid);
    if (s.status === "completed") finishers.add(s.playerUid);
    if (now - s.updatedAt <= 30 * dayMs) recent.add(s.playerUid);
    last = Math.max(last ?? 0, s.updatedAt);
    if (s.versionId) {
      const e =
        editions.get(s.versionId) ??
        editions
          .set(s.versionId, { players: new Set(), finishers: new Set() })
          .get(s.versionId)!;
      e.players.add(s.playerUid);
      if (s.status === "completed") e.finishers.add(s.playerUid);
    }
  }
  return {
    players: players.size,
    finishers: finishers.size,
    completionRate: players.size ? finishers.size / players.size : null,
    recentPlayers: recent.size,
    lastPlayedAt: last,
    byEdition: Object.fromEntries(
      [...editions].map(([id, e]) => [
        id,
        { players: e.players.size, finishers: e.finishers.size },
      ]),
    ),
  };
}
