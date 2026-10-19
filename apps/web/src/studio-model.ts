import type {
  Choice,
  Story as StoryData,
  StoryPage,
} from "../../../packages/contracts/index";
import { sceneMedia } from "../../../fixtures/media";

// Building blocks for Studio's story edits: new pages, choices, quiz scoring.
export const route = (targetPageId: string) => ({ targetPageId, effects: [] });
export const choice = (target = "ending"): Choice => ({
  id: crypto.randomUUID(),
  label: "Continue",
  unavailableDisplay: "locked",
  costs: [],
  outcome: { kind: "direct", route: route(target) },
});
export const makePage = (id: string): StoryPage => ({
  id,
  title: "New page",
  transcript: "What happens here?",
  kind: "scene",
  pageType: "text",
  entryEffects: [],
  choices: [choice()],
});
export const media = Object.values(sceneMedia);
export const shortId = () => crypto.randomUUID().slice(0, 8);
export const ending = (
  id: string,
  title: string,
  transcript: string,
): StoryPage => ({
  ...makePage(id),
  title,
  transcript,
  kind: "ending",
  choices: [],
});
export type Results = Extract<Choice["outcome"], { kind: "reveal" }>["results"];
export const result = (storyId: string, pageId: string): Results[number] => ({
  scoreId: `${storyId}:${pageId}`,
  route: route(pageId),
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
// three results, then a reveal page that shows the winning result.
export function quizTemplate(id: string): StoryData {
  const results = ["result-a", "result-b", "result-c"];
  const names = ["The Explorer", "The Builder", "The Dreamer"];
  const question = (
    pageId: string,
    title: string,
    labels: string[],
    target: string,
  ): StoryPage => ({
    ...makePage(pageId),
    title,
    transcript: "Pick the answer that fits you best.",
    pageType: "text-options",
    choices: labels.map((label, i) =>
      countToward({ ...choice(target), label }, `${id}:${results[i]}`),
    ),
  });
  return {
    id,
    versionId: "draft",
    rulesetVersion: "prototype-1",
    title: "Untitled quiz",
    entryPageId: "opening",
    pages: {
      opening: {
        ...makePage("opening"),
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
        ...makePage("reveal"),
        title: "Your answers are in",
        transcript: "Ready to see your result?",
        pageType: "reveal",
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
    entryPageId: "opening",
    pages: {
      opening: { ...makePage("opening"), title: "Opening" },
      ending: {
        ...makePage("ending"),
        title: "The end",
        kind: "ending",
        choices: [],
      },
    },
  };
}
