import { describe, expect, it } from "vitest";
import { analyticsUrl } from "../apps/web/src/analytics";
import { siteAnalytics, storyStats } from "../packages/domain/analytics";

describe("Web Analytics URLs", () => {
  it("hides private IDs and drops query strings and hashes", () => {
    const site = "https://www.storybranch.com";
    expect(analyticsUrl(`${site}/play/save-123`)).toBe(`${site}/play/[saveId]`);
    expect(analyticsUrl(`${site}/assets/edit/asset-9?x=1#top`)).toBe(
      `${site}/assets/edit/[assetId]`,
    );
    expect(analyticsUrl(`${site}/s/glass-harbor?ref=share`)).toBe(
      `${site}/s/glass-harbor`,
    );
    expect(analyticsUrl(`${site}/story-nodes/abc/2`)).toBe(
      `${site}/story-nodes/abc/2`,
    );
    expect(analyticsUrl(`${site}/players`)).toBe(`${site}/players`);
  });
});

describe("Site analytics", () => {
  const now = Date.UTC(2026, 9, 24, 12);
  const day = 86400000;
  const result = siteAnalytics({
    now,
    days: 30,
    accounts: [
      { createdAt: now - 1 * day, lastActiveAt: now - 3600000 },
      { createdAt: now - 1 * day, lastActiveAt: now - 3 * day },
      { createdAt: now - 40 * day, lastActiveAt: now - 20 * day },
      { createdAt: null, lastActiveAt: null },
    ],
    saves: [
      // Ana plays the harbor twice and finishes once; counted once each.
      {
        playerUid: "ana",
        storyId: "harbor",
        status: "completed",
        updatedAt: now - day,
      },
      {
        playerUid: "ana",
        storyId: "harbor",
        status: "active",
        updatedAt: now - 2 * day,
      },
      {
        playerUid: "ben",
        storyId: "harbor",
        status: "active",
        updatedAt: now - 50 * day,
      },
      // A side quest that isn't in the catalogue still shows up.
      {
        playerUid: "ben",
        storyId: "side-quest",
        status: "completed",
        updatedAt: now - 60 * day,
      },
    ],
    listings: [
      { id: "harbor", title: "The Harbor", hidden: false },
      { id: "quiet", title: "A Quiet Story", hidden: true },
    ],
    savesCapped: false,
  });

  it("counts sign-ups per UTC day and recent activity", () => {
    expect(result.accounts).toBe(4);
    expect(result.signups).toBe(2);
    expect(result.signupsByDay).toHaveLength(30);
    expect(result.signupsByDay.at(-2)).toEqual({ day: "2026-10-23", count: 2 });
    expect(result.active).toEqual({ day: 1, week: 2, month: 3 });
    expect(result.playersInPeriod).toBe(1);
  });

  it("counts each player once per story, with completion and recent play", () => {
    expect(result.stories).toEqual([
      {
        id: "harbor",
        title: "The Harbor",
        listed: true,
        hidden: false,
        players: 2,
        finishers: 1,
        completionRate: 0.5,
        activePlayers: 1,
        lastPlayedAt: now - day,
      },
      {
        id: "side-quest",
        title: "side-quest",
        listed: false,
        hidden: false,
        players: 1,
        finishers: 1,
        completionRate: 1,
        activePlayers: 0,
        lastPlayedAt: now - 60 * day,
      },
      {
        id: "quiet",
        title: "A Quiet Story",
        listed: true,
        hidden: true,
        players: 0,
        finishers: 0,
        completionRate: null,
        activePlayers: 0,
        lastPlayedAt: null,
      },
    ]);
  });
});

describe("Story stats", () => {
  it("counts a story's players once, per edition too", () => {
    const now = Date.UTC(2026, 9, 24);
    const day = 86400000;
    const stats = storyStats(
      [
        {
          playerUid: "ana",
          storyId: "s",
          versionId: "edition-1",
          status: "completed",
          updatedAt: now - 40 * day,
        },
        {
          playerUid: "ana",
          storyId: "s",
          versionId: "edition-2",
          status: "active",
          updatedAt: now - day,
        },
        {
          playerUid: "ben",
          storyId: "s",
          versionId: "edition-2",
          status: "active",
          updatedAt: now - 2 * day,
        },
        {
          playerUid: "cy",
          storyId: "other",
          versionId: "edition-1",
          status: "completed",
          updatedAt: now,
        },
      ],
      "s",
      now,
    );
    expect(stats).toEqual({
      players: 2,
      finishers: 1,
      completionRate: 0.5,
      recentPlayers: 2,
      lastPlayedAt: now - day,
      byEdition: {
        "edition-1": { players: 1, finishers: 1 },
        "edition-2": { players: 2, finishers: 0 },
      },
    });
  });
});
