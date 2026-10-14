import type { Save } from "../contracts/index";
import type { DashboardSummary, StoryProgress } from "../contracts/profile";

// The page facts the dashboard needs from one published story edition.
export type StoryOutline = {
  title: string;
  pages: Record<string, { title: string; kind: "scene" | "ending" }>;
};
export type CatalogueOutline = {
  id: string;
  title: string;
  description: string;
  versionId: string;
};
export const outlineKey = (storyId: string, versionId: string) =>
  `${storyId}/${versionId}`;
const humanize = (pageId: string) => pageId.replaceAll("-", " ");

// Derives progress from saves alone: no XP or rewards are granted here.
export function summarizeDashboard(
  saves: Save[],
  outlines: Map<string, StoryOutline>,
  catalogue: CatalogueOutline[],
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
    recentEndings: recent
      .filter(isEnding)
      .slice(0, 5)
      .map((s) => ({
        saveId: s.id,
        storyId: s.storyId,
        title: titleOf(s),
        pageTitle: pageTitleOf(s),
        at: s.updatedAt,
      })),
  };
}
