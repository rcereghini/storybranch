import type {
  Choice,
  Comic,
  Story as StoryData,
  StoryNode,
} from "../../../packages/contracts/index";
import type {
  CastMember,
  DraftRecord,
} from "../../../packages/contracts/authoring";
import type {
  ComicBrief,
  ComicScript,
} from "../../../packages/contracts/assist";
import { maxReferences } from "../../../packages/contracts/generation";
import { sceneMedia } from "../../../fixtures/media";

// Building blocks for Studio's story edits: new StoryNodes, choices, quiz scoring.
export const route = (targetStoryNodeId: string) => ({
  targetStoryNodeId,
  effects: [],
});
export const choice = (target = "ending"): Choice => ({
  id: crypto.randomUUID(),
  label: "Continue",
  unavailableDisplay: "locked",
  costs: [],
  outcome: { kind: "direct", route: route(target) },
});
export const makeStoryNode = (id: string): StoryNode => ({
  id,
  title: "New StoryNode",
  transcript: "What happens here?",
  kind: "scene",
  storyNodeType: "text",
  entryEffects: [],
  choices: [choice()],
});
export const media = Object.values(sceneMedia);
export const shortId = () => crypto.randomUUID().slice(0, 8);
export const ending = (
  id: string,
  title: string,
  transcript: string,
): StoryNode => ({
  ...makeStoryNode(id),
  title,
  transcript,
  kind: "ending",
  choices: [],
});
export type Results = Extract<Choice["outcome"], { kind: "reveal" }>["results"];
export const result = (
  storyId: string,
  storyNodeId: string,
): Results[number] => ({
  scoreId: `${storyId}:${storyNodeId}`,
  route: route(storyNodeId),
});
export const revealChoice = (results: Results): Choice => ({
  ...choice(),
  label: "Reveal my result",
  outcome: { kind: "reveal", results },
});
// An answer counts toward at most one result, through a score effect.
export const scoreOf = (c: Choice) =>
  c.outcome.kind === "direct"
    ? c.outcome.route.effects.find((e) => e.kind === "score")?.scoreId
    : undefined;
export const countToward = (c: Choice, scoreId?: string): Choice =>
  c.outcome.kind !== "direct"
    ? c
    : {
        ...c,
        outcome: {
          kind: "direct",
          route: {
            ...c.outcome.route,
            effects: [
              ...c.outcome.route.effects.filter((e) => e.kind !== "score"),
              ...(scoreId
                ? [
                    {
                      id: `score-${c.id}`,
                      kind: "score" as const,
                      scoreId,
                      delta: 1,
                    },
                  ]
                : []),
            ],
          },
        },
      };
// A starter quiz: two questions whose answers each add a point toward one of
// three results, then a reveal StoryNode that shows the winning result.
export function quizTemplate(id: string): StoryData {
  const results = ["result-a", "result-b", "result-c"];
  const names = ["The Explorer", "The Builder", "The Dreamer"];
  const question = (
    storyNodeId: string,
    title: string,
    labels: string[],
    target: string,
  ): StoryNode => ({
    ...makeStoryNode(storyNodeId),
    title,
    transcript: "Pick the answer that fits you best.",
    storyNodeType: "text-options",
    choices: labels.map((label, i) =>
      countToward({ ...choice(target), label }, `${id}:${results[i]}`),
    ),
  });
  return {
    id,
    versionId: "draft",
    rulesetVersion: "prototype-1",
    title: "Untitled quiz",
    entryStoryNodeId: "opening",
    storyNodes: {
      opening: {
        ...makeStoryNode("opening"),
        title: "Opening",
        transcript: "Answer a few questions to find out which one you are.",
        choices: [{ ...choice("question-1"), label: "Start the quiz" }],
      },
      "question-1": question(
        "question-1",
        "Question 1",
        ["Go somewhere new", "Make something", "Daydream"],
        "question-2",
      ),
      "question-2": question(
        "question-2",
        "Question 2",
        ["A map", "A toolbox", "A notebook"],
        "reveal",
      ),
      reveal: {
        ...makeStoryNode("reveal"),
        title: "Your answers are in",
        transcript: "Ready to see your result?",
        storyNodeType: "reveal",
        choices: [revealChoice(results.map((r) => result(id, r)))],
      },
      ...Object.fromEntries(
        results.map((r, i) => [
          r,
          ending(
            r,
            names[i],
            "Describe this result and what it says about you.",
          ),
        ]),
      ),
    },
  };
}
export function blankStory(id: string): StoryData {
  return {
    id,
    versionId: "draft",
    rulesetVersion: "prototype-1",
    title: "Untitled story",
    entryStoryNodeId: "unconnected",
    trunkContext: { version: 1, initialKeys: [] },
    storyNodes: {},
  };
}

export function starterStory(id: string): StoryData {
  return {
    ...blankStory(id),
    entryStoryNodeId: "opening",
    storyNodes: {
      opening: { ...makeStoryNode("opening"), title: "Opening" },
      ending: ending("ending", "The end", "Your journey ends here."),
    },
  };
}

// Comics: panels, the starter comic, and image prompts that carry the cast
// and art style so every panel draws the same characters.
export const comicPanel = (): Comic["panels"][number] => ({
  id: `panel-${shortId()}`,
  caption: "",
  alt: "",
});
export const newComic = (): Comic => ({
  layout: "grid",
  panels: [comicPanel(), comicPanel(), comicPanel(), comicPanel()],
});
// A comic story is one comic StoryNode that ends the story, so the player offers
// replay and sharing as soon as it is read.
export function comicTemplate(id: string): StoryData {
  return {
    id,
    versionId: "draft",
    rulesetVersion: "prototype-1",
    title: "Untitled comic",
    entryStoryNodeId: "comic",
    storyNodes: {
      comic: {
        ...makeStoryNode("comic"),
        title: "Untitled comic",
        transcript: "",
        storyNodeType: "comic",
        kind: "ending",
        choices: [],
        comic: newComic(),
      },
    },
  };
}
export const defaultComicStyle =
  "Bold-outlined cartoon, flat colors, expressive faces";
// Reference images steer the high-quality model; three is its limit.
export const castInPanel = (
  cast: CastMember[],
  panel: Comic["panels"][number],
) => {
  const text = `${panel.alt ?? ""} ${panel.caption ?? ""}`;
  // Whole names only, so "Al" is not found inside "also".
  const named = (name: string) =>
    new RegExp(
      `(?<![\\p{L}\\p{N}])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`,
      "iu",
    ).test(text);
  return cast
    .filter((c) => c.image && c.name.trim())
    .filter((c) => named(c.name.trim()))
    .slice(0, maxReferences);
};
export function panelPrompt(
  comic: Comic,
  index: number,
  style: string,
  cast: CastMember[],
) {
  const panel = comic.panels[index];
  const scene = [
    `Panel ${index + 1} of ${comic.panels.length} in a comic strip.`,
    panel.alt?.trim() || "Describe what happens in this panel.",
  ].join(" ");
  const rules = [
    cast.length
      ? "Draw each character exactly as in their reference image."
      : "",
    `Art style: ${style.trim() || defaultComicStyle}.`,
    "One single panel. No text, no speech bubbles, no captions, no panel borders.",
  ]
    .filter(Boolean)
    .join(" ");
  // The style and rules keep every panel consistent, so a long cast is
  // shortened rather than them.
  const characters = cast.length
    ? `Characters: ${cast.map((c) => `${c.name.trim()}: ${c.description.trim()}`).join("; ")}.`.slice(
        0,
        Math.max(0, 1800 - scene.length - rules.length - 2),
      )
    : "";
  return [scene, characters, rules].filter(Boolean).join(" ");
}
export const castPrompt = (member: CastMember, style: string) =>
  [
    `Character reference sheet for a comic: ${member.name.trim() || "a character"}.`,
    member.description.trim(),
    "Full body, front view, neutral pose, plain white background.",
    `Art style: ${style.trim() || defaultComicStyle}.`,
    "No text.",
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 1800);

// The companion's style choices, each with the prompt text it stands for.
export const comicStyles = [
  ["Cartoon", defaultComicStyle],
  [
    "Realistic",
    "Photorealistic, natural light, cinematic framing, real textures",
  ],
  [
    "Manga",
    "Black-and-white manga, clean ink lines, screentone shading, dynamic angles",
  ],
  [
    "Pixel art",
    "16-bit pixel art, limited palette, crisp pixels, retro game look",
  ],
  [
    "Watercolor",
    "Soft watercolor illustration, loose brushwork, warm paper texture",
  ],
  [
    "3D animated",
    "Polished 3D animated film look, soft lighting, expressive characters",
  ],
  [
    "Newspaper strip",
    "Classic newspaper comic strip, simple ink lines, flat muted colors",
  ],
] as const;

// Puts a companion script into the draft: new panels in the chosen layout,
// the cast (keeping the reference image of any character already there by
// name) and the style. A blank title or listing description is filled in.
export function applyComicScript(
  draft: DraftRecord,
  storyNodeId: string,
  script: ComicScript,
  brief: Pick<ComicBrief, "layout" | "style">,
): DraftRecord {
  const storyNode = draft.story.storyNodes[storyNodeId];
  if (!storyNode?.comic) return draft;
  const previous = draft.comic?.cast ?? [];
  const cast = script.cast.map((c) => {
    const same = previous.find(
      (p) => p.name.trim().toLowerCase() === c.name.toLowerCase(),
    );
    return { ...(same ?? { id: `cast-${shortId()}` }), ...c };
  });
  const untitled = (title: string) =>
    /^untitled/i.test(title.trim()) || !title.trim();
  return {
    ...draft,
    description: draft.description.trim()
      ? draft.description
      : script.description,
    comic: { style: brief.style, cast },
    story: {
      ...draft.story,
      title: untitled(draft.story.title) ? script.title : draft.story.title,
      storyNodes: {
        ...draft.story.storyNodes,
        [storyNodeId]: {
          ...storyNode,
          title: untitled(storyNode.title) ? script.title : storyNode.title,
          comic: {
            layout: brief.layout,
            panels: script.panels.map((p) => ({ ...comicPanel(), ...p })),
          },
        },
      },
    },
  };
}

// What drawing a comic takes: a sheet for each named character without a
// reference image, then each panel without an image.
export function drawPlan(draft: DraftRecord, storyNodeId: string) {
  const comic = draft.story.storyNodes[storyNodeId]?.comic;
  return {
    cast: (draft.comic?.cast ?? []).filter((c) => !c.image && c.name.trim()),
    panels: (comic?.panels ?? []).filter((p) => !p.image),
  };
}
