import { it, expect } from "vitest";
import {
  baseStats,
  isResultPage,
  start,
  transition,
  validateStory,
} from "../packages/domain/index";
import { validatePublication } from "../packages/domain/authoring";
import { explorerQuiz } from "../fixtures/page-stories";
import { sharePages } from "../scripts/share-pages";

const questions = ["map", "storm", "stranger", "treasure"];
// Answers the four questions with the given result types, then reveals.
function play(types: string[]) {
  let s = start(explorerQuiz, "quiz", "player", baseStats, 0);
  s = transition(explorerQuiz, s, "map", 0, 1).save;
  questions.forEach((q, i) => {
    const next = questions[i + 1] ?? "reveal";
    s = transition(explorerQuiz, s, `${next}-${types[i]}`, s.revision, 2).save;
  });
  expect(s.pageId).toBe("reveal");
  return transition(explorerQuiz, s, "reveal", s.revision, 3);
}

it("reveals the result the answers counted toward most", () => {
  const moved = play(["keeper", "spark", "keeper", "tinkerer"]);
  expect(moved.save.pageId).toBe("keeper");
  expect(moved.save.status).toBe("completed");
  expect(moved.save.scores).toEqual({
    "explorer-quiz:keeper": 2,
    "explorer-quiz:spark": 1,
    "explorer-quiz:tinkerer": 1,
  });
});

it("breaks a tie in favour of the result listed first", () => {
  expect(play(["spark", "tinkerer", "spark", "tinkerer"]).save.pageId).toBe(
    "tinkerer",
  );
  expect(play(["spark", "spark", "keeper", "keeper"]).save.pageId).toBe(
    "keeper",
  );
});

it("reveals the first result for saves made before quizzes had scores", () => {
  let s = start(explorerQuiz, "old", "player", baseStats, 0);
  s = { ...s, pageId: "reveal" };
  delete s.scores;
  expect(transition(explorerQuiz, s, "reveal", 0, 1).save.pageId).toBe(
    "navigator",
  );
});

it("marks only reveal destinations as quiz results", () => {
  expect(isResultPage(explorerQuiz, "spark")).toBe(true);
  expect(isResultPage(explorerQuiz, "welcome")).toBe(false);
  expect(validatePublication(explorerQuiz).id).toBe("explorer-quiz");
});

it("rejects malformed reveal pages and results", () => {
  const reveal = (edit: (story: any) => void) => {
    const story = structuredClone(explorerQuiz) as any;
    edit(story);
    return () => validateStory(story);
  };
  expect(
    reveal(
      (s) =>
        (s.pages.reveal.choices[0].outcome.results[1].scoreId =
          "explorer-quiz:navigator"),
    ),
  ).toThrow("own score");
  expect(
    reveal(
      (s) =>
        (s.pages.reveal.choices[0].outcome.results[0].route.targetPageId =
          "map"),
    ),
  ).toThrow("must be an ending");
  expect(reveal((s) => (s.pages.reveal.pageType = "text-options"))).toThrow(
    "Only a reveal page",
  );
  expect(reveal((s) => (s.pages.reveal.choices = []))).toThrow(
    "Reveal page requires",
  );
  expect(
    reveal(
      (s) =>
        (s.pages.reveal.choices[0].outcome.results[0].scoreId =
          "other-story:navigator"),
    ),
  ).toThrow("Foreign namespace");
  expect(
    reveal((s) => (s.pages.reveal.choices[0].outcome.results.length = 1)),
  ).toThrow();
});

it("words quiz result link previews as a result", () => {
  const pages = sharePages(
    "<html><head><title>x</title></head></html>",
    "https://www.storybranch.com",
    [{ story: explorerQuiz, description: "Quiz" }],
    new Set(),
  );
  const result = pages.find(
    (p) => p.path === "s/explorer-quiz/ending/keeper",
  )!.html;
  expect(result).toContain("I got “The Keeper” in What Kind of Explorer");
  expect(result).toContain('name="storybranch:result"');
});
