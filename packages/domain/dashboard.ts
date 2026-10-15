import type { Save } from "../contracts/index";
import {
  genreIds,
  type DashboardSummary,
  type GenreId,
  type Recommendation,
  type StoryProgress,
} from "../contracts/profile";

// The page facts the dashboard needs from one published story edition.
export type StoryOutline = {
  title: string;
  pages: Record<string, { title: string; kind: "scene" | "ending" }>;
};
export type CatalogueOutline = {
  id: string;
  title: string;
  description: string;
  genre: string;
  duration: string;
  versionId: string;
};
// A story-log event, tagged with the save it belongs to.
export type ActivityEvent = { saveId: string; label: string; at: number };
export const outlineKey = (storyId: string, versionId: string) =>
  `${storyId}/${versionId}`;
const humanize = (pageId: string) => pageId.replaceAll("-", " ");

export const genreLabels: Record<GenreId, string> = {
  mystery: "Mystery",
  fantasy: "Fantasy",
  "sci-fi": "Sci-fi",
  adventure: "Adventure",
  horror: "Horror",
  romance: "Romance",
  comedy: "Comedy",
  historical: "Historical",
};
// Catalogue genres are free text ("Mystery", "Sci-fi thriller"); match loosely.
export function genreOf(label: string): GenreId | null {
  const text = label.toLowerCase();
  return (
    genreIds.find((g) =>
      g === "sci-fi" ? /sci[- ]?fi|science/.test(text) : text.includes(g),
    ) ?? null
  );
}

// Derives progress from saves alone: no XP or rewards are granted here.
export function summarizeDashboard(
  saves: Save[],
  outlines: Map<string, StoryOutline>,
  catalogue: CatalogueOutline[],
  events: ActivityEvent[] = [],
  favorites: GenreId[] = [],
): DashboardSummary {
  const recent = [...saves].sort((a, b) => b.updatedAt - a.updatedAt);
  const outline = (s: Save) => outlines.get(outlineKey(s.storyId, s.versionId));
  const titleOf = (s: Save) =>
    outline(s)?.title ??
    catalogue.find((c) => c.id === s.storyId)?.title ??
    s.storyId;
  const pageTitleOf = (s: Save) =>
    outline(s)?.pages[s.pageId]?.title ?? humanize(s.pageId);
  const isEnding = (s: Save) =>
    s.status === "completed" &&
    (outline(s)?.pages[s.pageId]?.kind ?? "ending") === "ending";

  const main = recent.filter((s) => !s.parentPlaythroughId);
  const endingsByStory = new Map<string, Set<string>>();
  for (const s of recent.filter(isEnding)) {
    const found = endingsByStory.get(s.storyId) ?? new Set<string>();
    found.add(s.pageId);
    endingsByStory.set(s.storyId, found);
  }

  const stories: StoryProgress[] = catalogue.map((c) => {
    const published = outlines.get(outlineKey(c.id, c.versionId));
    const endings = Object.entries(published?.pages ?? {})
      .filter(([, page]) => page.kind === "ending")
      .map(([pageId]) => pageId);
    const found = endingsByStory.get(c.id) ?? new Set<string>();
    const own = main.filter((s) => s.storyId === c.id);
    const active = own.find((s) => s.status === "active");
    return {
      storyId: c.id,
      title: c.title,
      description: c.description,
      genre: c.genre,
      duration: c.duration,
      status: active
        ? "in-progress"
        : own.some((s) => s.status === "completed")
          ? "completed"
          : "not-started",
      activeSaveId: active?.id ?? null,
      endingsFound: endings.filter((pageId) => found.has(pageId)).length,
      endingsTotal: endings.length,
    };
  });

  // Unplayed stories first (favorite genres leading), then finished stories
  // that still hide endings.
  const liked = (s: StoryProgress) => {
    const genre = genreOf(s.genre);
    return genre && favorites.includes(genre) ? genre : null;
  };
  const fresh = stories
    .filter((s) => s.status === "not-started")
    .sort((a, b) => Number(!!liked(b)) - Number(!!liked(a)));
  const unfinished = stories.filter(
    (s) => s.status === "completed" && s.endingsFound < s.endingsTotal,
  );
  const recommendations: Recommendation[] = [...fresh, ...unfinished]
    .slice(0, 3)
    .map((s) => {
      const genre = liked(s);
      const left = s.endingsTotal - s.endingsFound;
      return {
        storyId: s.storyId,
        title: s.title,
        description: s.description,
        genre: s.genre,
        reason:
          s.status === "completed"
            ? `${left} ending${left === 1 ? "" : "s"} left to find`
            : genre
              ? `Because you like ${genreLabels[genre]}`
              : "New to you",
      };
    });

  const savesById = new Map(recent.map((s) => [s.id, s]));
  const activity = [...events]
    .filter((e) => savesById.has(e.saveId))
    .sort((a, b) => b.at - a.at)
    .slice(0, 8)
    .map((e) => {
      const s = savesById.get(e.saveId)!;
      return {
        saveId: e.saveId,
        storyId: s.storyId,
        title: titleOf(s),
        label: e.label,
        at: e.at,
      };
    });

  return {
    totals: {
      started: new Set(main.map((s) => s.storyId)).size,
      completed: new Set(
        main.filter((s) => s.status === "completed").map((s) => s.storyId),
      ).size,
      sideQuests: recent.length - main.length,
      endingsFound: [...endingsByStory.values()].reduce(
        (sum, found) => sum + found.size,
        0,
      ),
      keys: new Set(recent.flatMap((s) => s.keys)).size,
      milestones: new Set(recent.flatMap((s) => s.milestones)).size,
    },
    continue: recent
      .filter((s) => s.status === "active")
      .slice(0, 4)
      .map((s) => ({
        saveId: s.id,
        storyId: s.storyId,
        title: titleOf(s),
        pageTitle: pageTitleOf(s),
        sideQuest: !!s.parentPlaythroughId,
        updatedAt: s.updatedAt,
      })),
    stories,
    // Each distinct ending once, at its most recent discovery.
    recentEndings: recent
      .filter(isEnding)
      .filter(
        (s, i, all) =>
          all.findIndex(
            (o) => o.storyId === s.storyId && o.pageId === s.pageId,
          ) === i,
      )
      .slice(0, 5)
      .map((s) => ({
        saveId: s.id,
        storyId: s.storyId,
        pageId: s.pageId,
        title: titleOf(s),
        pageTitle: pageTitleOf(s),
        at: s.updatedAt,
      })),
    activity,
    recommendations,
  };
}
