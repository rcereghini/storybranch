import { it, expect } from "vitest";
import { draftSchema } from "../packages/contracts/authoring";
import {
  assistCommandSchema,
  clampComicScript,
  comicBriefSchema,
} from "../packages/contracts/assist";
import { pageSchema, type Story } from "../packages/contracts/index";
import { validatePublication } from "../packages/domain/authoring";
import {
  baseStats,
  comicIssue,
  start,
  transition,
} from "../packages/domain/index";
import {
  applyComicScript,
  castInPanel,
  castPrompt,
  comicPanel,
  comicTemplate,
  drawPlan,
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

const brief = {
  premise: "My cat knocks my phone off the table during a work call.",
  style: "Bold cartoon",
  layout: "grid" as const,
  panelCount: 4,
};

it("asks the companion for a comic only with a brief that fits a layout", () => {
  expect(comicBriefSchema.safeParse(brief).success).toBe(true);
  expect(comicBriefSchema.safeParse({ ...brief, panelCount: 6 }).success).toBe(
    false,
  );
  expect(
    comicBriefSchema.safeParse({ ...brief, layout: "scroll", panelCount: 12 })
      .success,
  ).toBe(true);
  expect(
    comicBriefSchema.safeParse({ ...brief, layout: "scroll", panelCount: 13 })
      .success,
  ).toBe(false);
  expect(comicBriefSchema.safeParse({ ...brief, premise: "cat" }).success).toBe(
    false,
  );
  const command = {
    idempotencyKey: "assist-comic",
    action: "comic-script",
    story: { title: "Untitled comic", description: "" },
    page: {
      title: "Untitled comic",
      text: "",
      pageType: "comic",
      ending: true,
      outputs: [],
    },
    before: [],
    comic: brief,
  };
  expect(assistCommandSchema.safeParse(command).success).toBe(true);
  const { comic: _, ...bare } = command;
  expect(assistCommandSchema.safeParse(bare).success).toBe(false);
  expect(
    assistCommandSchema.safeParse({ ...command, action: "write" }).success,
  ).toBe(false);
});

it("clamps a model's script to the panels asked for and the cast limit", () => {
  const panel = (n: number) => ({ alt: `Beat ${n}`, caption: `Line ${n}` });
  expect(
    clampComicScript({ panels: [panel(1), panel(2), panel(3)] }, brief),
  ).toBeNull();
  const script = clampComicScript(
    {
      title: "",
      description: "x".repeat(900),
      cast: [
        { name: "Mo", description: "Orange cat" },
        { name: "mo", description: "Duplicate" },
        ...Array.from({ length: 8 }, (_, i) => ({
          name: `Extra ${i}`,
          description: "",
        })),
      ],
      panels: [1, 2, 3, 4, 5].map(panel).concat([{ alt: "", caption: "x" }]),
    },
    brief,
  )!;
  expect(script.title).toBe("Untitled comic");
  expect(script.description).toHaveLength(500);
  expect(script.cast.map((c) => c.name).slice(0, 2)).toEqual(["Mo", "Extra 0"]);
  expect(script.cast).toHaveLength(6);
  expect(script.panels).toEqual([1, 2, 3, 4].map(panel));
});

it("puts a script into the draft and plans only the missing images", () => {
  const story = comicTemplate("story-comic");
  const draft = {
    story,
    description: "",
    revision: 1,
    publishedVersionId: null,
    comic: {
      style: "",
      cast: [
        {
          id: "cast-mo",
          name: "Mo",
          description: "Old look",
          image: "asset:generated-mo",
        },
      ],
    },
  };
  const script = {
    title: "Mute Button",
    description: "A cat ends a meeting.",
    cast: [
      { name: "mo", description: "Orange cat, torn ear" },
      { name: "Dana", description: "Tired, green hoodie" },
    ],
    panels: Array.from({ length: 9 }, (_, i) => ({
      alt: `Mo and Dana, beat ${i + 1}`,
      caption: "",
    })),
  };
  const next = applyComicScript(draft, "comic", script, {
    layout: "grid",
    style: "Manga",
  });
  expect(next.story.title).toBe("Mute Button");
  expect(next.description).toBe("A cat ends a meeting.");
  expect(next.comic!.style).toBe("Manga");
  // Mo keeps the reference image already drawn; Dana is new.
  expect(next.comic!.cast[0]).toMatchObject({
    id: "cast-mo",
    image: "asset:generated-mo",
    description: "Orange cat, torn ear",
  });
  const panels = next.story.pages.comic.comic!.panels;
  expect(new Set(panels.map((p) => p.id)).size).toBe(9);
  expect(comicIssue(next.story.pages.comic)).toBe("Add an image to panel 1.");
  expect(draftSchema.safeParse(next).success).toBe(false); // has record fields
  const { revision: _r, publishedVersionId: _p, ...plain } = next;
  expect(draftSchema.safeParse(plain).success).toBe(true);
  const plan = drawPlan(next, "comic");
  expect(plan.cast.map((c) => c.name)).toEqual(["Dana"]);
  expect(plan.panels).toHaveLength(9);
  // A creator's own title is kept.
  const named = { ...draft, story: { ...story, title: "Office Cats" } };
  expect(
    applyComicScript(named, "comic", script, { layout: "grid", style: "" })
      .story.title,
  ).toBe("Office Cats");
});
