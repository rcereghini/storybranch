import { it, expect } from "vitest";
import { draftSchema } from "../packages/contracts/authoring";
import { pageSchema, type Story } from "../packages/contracts/index";
import { validatePublication } from "../packages/domain/authoring";
import {
  baseStats,
  comicIssue,
  start,
  transition,
} from "../packages/domain/index";
import {
  castInPanel,
  castPrompt,
  comicPanel,
  comicTemplate,
  panelPrompt,
} from "../apps/web/src/studio-model";

const drawn = (story: Story, pageId = "comic") => {
  for (const [i, panel] of story.pages[pageId].comic!.panels.entries())
    panel.image = `asset:generated-panel-${i}`;
  return story;
};

it("starts a comic as a valid private draft that publishes once every panel has art", () => {
  const story = comicTemplate("story-comic");
  expect(
    draftSchema.safeParse({
      story,
      description: "",
      comic: { style: "", cast: [] },
    }).success,
  ).toBe(true);
  expect(() => validatePublication(story)).toThrow("Add an image to panel 1");
  const published = validatePublication(drawn(story));
  // The comic is the ending, so the completion shell offers replay at once.
  expect(start(published, "save", "uid", baseStats, 0).status).toBe(
    "completed",
  );
});

it("keeps a grid square and bounds a scrolling strip", () => {
  const story = drawn(comicTemplate("story-comic"));
  const page = story.pages.comic;
  page.comic!.panels.push(
    { ...comicPanel(), image: "asset:generated-extra-1" },
    { ...comicPanel(), image: "asset:generated-extra-2" },
  );
  expect(comicIssue(page)).toBe("A square grid needs 4 or 9 panels.");
  expect(() => validatePublication(story)).toThrow("4 or 9 panels");
  page.comic!.layout = "scroll";
  expect(comicIssue(page)).toBeNull();
  page.comic!.panels = page.comic!.panels.slice(0, 3);
  expect(comicIssue(page)).toBe("A strip needs 4 to 12 panels.");
  expect(
    pageSchema.safeParse({
      ...page,
      comic: {
        layout: "scroll",
        panels: Array.from({ length: 13 }, comicPanel),
      },
    }).success,
  ).toBe(false);
  page.comic!.panels = [page.comic!.panels[0], ...page.comic!.panels];
  page.comic!.panels.push(page.comic!.panels[1]);
  expect(comicIssue(page)).toBe("Each panel needs its own ID.");
});

it("rejects panels on other page types and photos or video on a comic", () => {
  const story = drawn(comicTemplate("story-comic"));
  const text = {
    ...story,
    pages: { comic: { ...story.pages.comic, pageType: "text" as const } },
  };
  expect(() => validatePublication(text)).toThrow("Only a comic page");
  const photo = structuredClone(story);
  photo.pages.comic.image = "asset:generated-photo";
  expect(() => validatePublication(photo)).toThrow("shows only its panels");
  const empty = structuredClone(story);
  delete empty.pages.comic.comic;
  expect(() => validatePublication(empty)).toThrow("shows only its panels");
});

it("routes a linear comic through its one server-resolved Next", () => {
  const story = drawn(comicTemplate("story-comic"));
  story.pages.comic.kind = "scene";
  story.pages.comic.choices = [
    {
      id: "next",
      label: "Next",
      unavailableDisplay: "locked",
      costs: [],
      outcome: { kind: "direct", route: { targetPageId: "end", effects: [] } },
    },
  ];
  story.pages.end = {
    ...story.pages.comic,
    id: "end",
    pageType: "text",
    kind: "ending",
    choices: [],
  };
  delete story.pages.end.comic;
  const published = validatePublication(story);
  const save = start(published, "save", "uid", baseStats, 0);
  expect(transition(published, save, "next", 0, 1).save.pageId).toBe("end");
  const branching = structuredClone(story);
  branching.pages.comic.choices.push({
    ...branching.pages.comic.choices[0],
    id: "other",
  });
  expect(() => validatePublication(branching)).toThrow("Linear page");
});

it("keeps the cast and style draft-only and bounded", () => {
  const story = comicTemplate("story-comic");
  const member = { id: "cast-a", name: "Dana", description: "Tall" };
  expect(
    draftSchema.safeParse({
      story,
      description: "",
      comic: { style: "Ink", cast: Array(7).fill(member) },
    }).success,
  ).toBe(false);
  // The published story schema has no place for it.
  expect(
    pageSchema.safeParse({ ...story.pages.comic, cast: [member] }).success,
  ).toBe(false);
});

it("writes panel prompts that carry the style and cast and ask for no text", () => {
  const story = comicTemplate("story-comic");
  const comic = story.pages.comic.comic!;
  comic.panels[1].alt = "dana finds the cat in the fridge";
  const cast = [
    {
      id: "a",
      name: "Dana",
      description: "Tall, green hoodie",
      image: "asset:generated-dana",
    },
    {
      id: "b",
      name: "Cat",
      description: "Orange, torn ear",
      image: "asset:generated-cat",
    },
    { id: "c", name: "Fridge", description: "No reference image" },
    {
      id: "d",
      name: "Moon",
      description: "Not in this panel",
      image: "asset:generated-moon",
    },
  ];
  const inPanel = castInPanel(cast, comic.panels[1]);
  expect(inPanel.map((c) => c.id)).toEqual(["a", "b"]);
  const prompt = panelPrompt(comic, 1, "Thick ink lines", inPanel);
  expect(prompt).toContain("Panel 2 of 4");
  expect(prompt).toContain("Dana: Tall, green hoodie");
  expect(prompt).toContain("Art style: Thick ink lines.");
  expect(prompt).toContain("No text, no speech bubbles");
  expect(panelPrompt(comic, 0, "", [])).toContain("Bold-outlined cartoon");
  expect(castPrompt(cast[0], "x".repeat(2000)).length).toBeLessThanOrEqual(
    1800,
  );
});
