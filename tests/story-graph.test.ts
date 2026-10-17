import { it, expect } from "vitest";
import {
  arrangePages,
  connectPage,
  connections,
} from "../packages/domain/story-graph";
import { pageStories } from "../fixtures/page-stories";
import { draftSchema } from "../packages/contracts/authoring";

it("reconnects an output without losing effects or changing other routes", () => {
  const story = structuredClone(
    pageStories.find((s) =>
      Object.values(s.pages).some((p) => p.pageType === "dice"),
    )!,
  );
  const page = Object.values(story.pages).find((p) => p.pageType === "dice")!;
  const edges = connections(page);
  const before = structuredClone(page.choices[0]);
  const updated = connectPage(story, page.id, edges[0], edges[1].target);
  expect(connections(updated.pages[page.id])[0].target).toBe(edges[1].target);
  expect(updated.pages[page.id].choices[0].outcome).toMatchObject({
    failure: before.outcome.kind === "dice" ? before.outcome.failure : {},
  });
  expect(page.choices[0]).toEqual(before);
  expect(() => connectPage(story, page.id, edges[0], "missing")).toThrow();
});
it("arranges branches and cycles without duplicates or infinite traversal", () => {
  const story = structuredClone(pageStories[0]);
  const entry = story.pages[story.entryPageId];
  const loop = connectPage(story, entry.id, connections(entry)[0], entry.id);
  const positions = arrangePages(loop);
  expect(Object.keys(positions).sort()).toEqual(
    Object.keys(story.pages).sort(),
  );
  expect(
    new Set(Object.values(positions).map((p) => `${p.x}:${p.y}`)).size,
  ).toBe(Object.keys(story.pages).length);
  expect(positions[entry.id].x).toBe(40);
});
it("stores bounded editor positions separately from the published story graph", () => {
  const story = pageStories[0];
  const draft = { story, description: "", pagePositions: arrangePages(story) };
  expect(draftSchema.parse(draft).pagePositions).toEqual(draft.pagePositions);
  expect(
    draftSchema.safeParse({
      ...draft,
      pagePositions: { x: { x: Infinity, y: 0 } },
    }).success,
  ).toBe(false);
  expect(
    draftSchema.safeParse({ ...draft, pagePositions: { x: { x: -1, y: 0 } } })
      .success,
  ).toBe(false);
  expect(story).not.toHaveProperty("pagePositions");
});
