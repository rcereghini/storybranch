import { it, expect } from "vitest";
import type { Save } from "../packages/contracts/index";
import { profileUpdateSchema } from "../packages/contracts/profile";
import { baseStats } from "../packages/domain/index";
import {
  genreOf,
  outlineKey,
  summarizeDashboard,
  type StoryOutline,
} from "../packages/domain/dashboard";
import { projectProfile } from "../services/api/profile-projection";

const save = (overrides: Partial<Save>): Save => ({
  id: "save",
  playerUid: "player",
  storyId: "harbor",
  versionId: "v1",
  rulesetVersion: "prototype-1",
  pageId: "dock",
  revision: 1,
  status: "active",
  stats: baseStats,
  statsSnapshot: baseStats,
  keys: [],
  items: {},
  health: 10,
  milestones: [],
  appliedEntryEffects: [],
  parentPlaythroughId: null,
  parentRevision: null,
  updatedAt: 1,
  ...overrides,
});
const harbor: StoryOutline = {
  title: "The Harbor",
  pages: {
    dock: { title: "The dock", kind: "scene" },
    home: { title: "Home again", kind: "ending" },
    sea: { title: "Out to sea", kind: "ending" },
    lost: { title: "Lost", kind: "ending" },
  },
};
const outlines = new Map([[outlineKey("harbor", "v1"), harbor]]);
const entry = (id: string, title: string, genre = "") => ({
  id,
  title,
  description: `${title}.`,
  genre,
  duration: "5 min",
  versionId: "v1",
});
const catalogue = [entry("harbor", "The Harbor"), entry("door", "The Door")];

it("derives story status, distinct endings and totals from saves", () => {
  const summary = summarizeDashboard(
    [
      save({ id: "a", status: "completed", pageId: "home", updatedAt: 3 }),
      save({ id: "b", status: "completed", pageId: "home", updatedAt: 4 }),
      save({ id: "c", status: "completed", pageId: "sea", updatedAt: 5 }),
      save({
        id: "d",
        updatedAt: 6,
        keys: ["harbor:pass", "harbor:map"],
        milestones: ["harbor:dock"],
      }),
      save({
        id: "side",
        storyId: "bell",
        versionId: "b1",
        pageId: "bell-tower",
        parentPlaythroughId: "d",
        keys: ["harbor:pass"],
        updatedAt: 7,
      }),
    ],
    outlines,
    catalogue,
  );
  expect(summary.totals).toEqual({
    started: 1,
    completed: 1,
    sideQuests: 1,
    endingsFound: 2,
    keys: 2,
    milestones: 1,
  });
  expect(summary.stories).toEqual([
    expect.objectContaining({
      storyId: "harbor",
      status: "in-progress",
      activeSaveId: "d",
      endingsFound: 2,
      endingsTotal: 3,
    }),
    expect.objectContaining({
      storyId: "door",
      status: "not-started",
      endingsFound: 0,
      endingsTotal: 0,
    }),
  ]);
  // Most recent first; unknown editions fall back to ids, not errors.
  expect(summary.continue.map((c) => [c.saveId, c.pageTitle])).toEqual([
    ["side", "bell tower"],
    ["d", "The dock"],
  ]);
  expect(summary.continue[0]).toMatchObject({ sideQuest: true, title: "bell" });
  // Reaching "Home again" twice lists it once, at its latest save.
  expect(summary.recentEndings.map((e) => [e.pageTitle, e.saveId])).toEqual([
    ["Out to sea", "c"],
    ["Home again", "b"],
  ]);
});

it("reports a finished story as completed once nothing is active", () => {
  const summary = summarizeDashboard(
    [save({ status: "completed", pageId: "lost" })],
    outlines,
    catalogue,
  );
  expect(summary.stories[0]).toMatchObject({
    status: "completed",
    activeSaveId: null,
    endingsFound: 1,
  });
  expect(summary.continue).toEqual([]);
});

it("recommends unplayed favorite genres first, then hidden endings", () => {
  const shelf = [
    entry("harbor", "The Harbor", "Mystery"),
    entry("door", "The Door", "Fantasy"),
    entry("rocket", "Rocket", "Sci-fi thriller"),
  ];
  const finished = [save({ status: "completed", pageId: "home" })];
  const picks = summarizeDashboard(
    finished,
    outlines,
    shelf,
    [],
    ["sci-fi"],
  ).recommendations;
  expect(picks.map((p) => [p.storyId, p.reason])).toEqual([
    ["rocket", "Because you like Sci-fi"],
    ["door", "New to you"],
    ["harbor", "2 endings left to find"],
  ]);
  expect(genreOf("Sci-fi thriller")).toBe("sci-fi");
  expect(genreOf("Mixed-page prototype")).toBeNull();
});

it("merges recent story-log events across saves, newest first", () => {
  const summary = summarizeDashboard(
    [save({ id: "a" }), save({ id: "b", storyId: "door", versionId: "v9" })],
    outlines,
    catalogue,
    [
      { saveId: "a", label: "Arrived", at: 1 },
      { saveId: "b", label: "Opened the door", at: 3 },
      { saveId: "a", label: "Took the pass", at: 2 },
      { saveId: "gone", label: "Deleted save", at: 4 },
    ],
  );
  expect(summary.activity.map((a) => [a.label, a.title])).toEqual([
    ["Opened the door", "The Door"],
    ["Took the pass", "The Harbor"],
    ["Arrived", "The Harbor"],
  ]);
});

it("validates profile customizations and defaults older profiles", () => {
  const full = {
    displayName: "Wren",
    avatarId: "raven",
    tagline: "  Collector of quiet endings ",
    bio: "Line one\nLine two",
    bannerId: "aurora",
    accent: "rose",
    avatarTint: "sky",
    avatarFrame: "hexagon",
    favoriteGenres: ["mystery", "sci-fi"],
  };
  expect(profileUpdateSchema.parse(full)).toEqual({
    ...full,
    tagline: "Collector of quiet endings",
  });
  for (const bad of [
    { tagline: "x".repeat(81) },
    { tagline: "tab\there" },
    { bio: "x".repeat(501) },
    { bannerId: "space" },
    { accent: "#ff0000" },
    { avatarTint: "plaid" },
    { avatarFrame: "star" },
    { favoriteGenres: ["mystery", "mystery"] },
    {
      favoriteGenres: [
        "mystery",
        "fantasy",
        "sci-fi",
        "horror",
        "comedy",
        "romance",
      ],
    },
    { favoriteGenres: ["western"] },
  ])
    expect(profileUpdateSchema.safeParse({ ...full, ...bad }).success).toBe(
      false,
    );
  expect(
    projectProfile("uid", {
      stats: baseStats,
      accent: "neon",
      bannerId: "storm",
    }),
  ).toMatchObject({
    accent: "teal",
    bannerId: "storm",
    tagline: "",
    favoriteGenres: [],
    avatarFrame: "circle",
    avatarTint: "preset",
  });
});

it("validates profile edits and defaults older profiles", () => {
  expect(
    profileUpdateSchema.parse({ displayName: "  Wren ", avatarId: "raven" }),
  ).toEqual({ displayName: "Wren", avatarId: "raven" });
  for (const bad of [
    { displayName: "", avatarId: "raven" },
    { displayName: "x".repeat(33), avatarId: "raven" },
    { displayName: "Bell\u0007", avatarId: "raven" },
    { displayName: "Wren", avatarId: "dragon" },
    { displayName: "Wren", avatarId: "raven", stats: { agility: 99 } },
  ])
    expect(profileUpdateSchema.safeParse(bad).success).toBe(false);

  const stored = { stats: baseStats, status: "active" };
  expect(projectProfile("uid", stored, "Ada Lovelace")).toMatchObject({
    displayName: "Ada Lovelace",
    avatarId: "lantern",
    achievements: [],
  });
  expect(projectProfile("uid", stored).displayName).toBe("Player");
  expect(
    projectProfile("uid", { ...stored, displayName: "Wren", avatarId: "tide" }),
  ).toMatchObject({ displayName: "Wren", avatarId: "tide" });
});
