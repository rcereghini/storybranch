import { it, expect } from "vitest";
import {
  baseStats,
  isResultStoryNode,
  start,
  transition,
  validateStory,
} from "../packages/domain/index";
import { validatePublication } from "../packages/domain/authoring";
import { explorerQuiz } from "../fixtures/story-node-stories";
import { shareDocuments } from "../scripts/share-documents";

const questions = ["map", "storm", "stranger", "treasure"];
// Answers the four questions with the given result types, then reveals.
function play(types: string[]) {
  let s = start(explorerQuiz, "quiz", "player", baseStats, 0);
  s = transition(explorerQuiz, s, "map", 0, 1).save;
  questions.forEach((q, i) => {
    const next = questions[i + 1] ?? "reveal";
    s = transition(explorerQuiz, s, `${next}-${types[i]}`, s.revision, 2).save;
  });
  expect(s.storyNodeId).toBe("reveal");
  return transition(explorerQuiz, s, "reveal", s.revision, 3);
}

it("reveals the result the answers counted toward most", () => {
  const moved = play(["keeper", "spark", "keeper", "tinkerer"]);
  expect(moved.save.storyNodeId).toBe("keeper");
  expect(moved.save.status).toBe("completed");
  expect(moved.save.scores).toEqual({
    "explorer-quiz:keeper": 2,
    "explorer-quiz:spark": 1,
    "explorer-quiz:tinkerer": 1,
  });
});

it("breaks a tie in favour of the result listed first", () => {
  expect(
    play(["spark", "tinkerer", "spark", "tinkerer"]).save.storyNodeId,
  ).toBe("tinkerer");
  expect(play(["spark", "spark", "keeper", "keeper"]).save.storyNodeId).toBe(
    "keeper",
  );
});

it("reveals the first result for saves made before quizzes had scores", () => {
  let s = start(explorerQuiz, "old", "player", baseStats, 0);
  s = { ...s, storyNodeId: "reveal" };
  delete s.scores;
  expect(transition(explorerQuiz, s, "reveal", 0, 1).save.storyNodeId).toBe(
    "navigator",
  );
});

it("marks only reveal destinations as quiz results", () => {
  expect(isResultStoryNode(explorerQuiz, "spark")).toBe(true);
  expect(isResultStoryNode(explorerQuiz, "welcome")).toBe(false);
  expect(validatePublication(explorerQuiz).id).toBe("explorer-quiz");
});

it("rejects malformed reveal StoryNodes and results", () => {
  const reveal = (edit: (story: any) => void) => {
    const story = structuredClone(explorerQuiz) as any;
    edit(story);
    return () => validateStory(story);
  };
  expect(
    reveal(
      (s) =>
        (s.storyNodes.reveal.choices[0].outcome.results[1].scoreId =
          "explorer-quiz:navigator"),
    ),
  ).toThrow("own score");
  expect(
    reveal(
      (s) =>
        (s.storyNodes.reveal.choices[0].outcome.results[0].route.targetStoryNodeId =
          "map"),
    ),
  ).toThrow("must be an ending");
  expect(
    reveal((s) => (s.storyNodes.reveal.storyNodeType = "text-options")),
  ).toThrow("Only a reveal StoryNode");
  expect(reveal((s) => (s.storyNodes.reveal.choices = []))).toThrow(
    "Reveal StoryNode requires",
  );
  expect(
    reveal(
      (s) =>
        (s.storyNodes.reveal.choices[0].outcome.results[0].scoreId =
          "other-story:navigator"),
    ),
  ).toThrow("Foreign namespace");
  expect(
    reveal((s) => (s.storyNodes.reveal.choices[0].outcome.results.length = 1)),
  ).toThrow();
});

it("words quiz result link previews as a result", () => {
  const storyNodes = shareDocuments(
    "<html><head><title>x</title></head></html>",
    "https://www.storybranch.com",
    [{ story: explorerQuiz, description: "Quiz" }],
    new Set(),
  );
  const result = storyNodes.find(
    (p) => p.path === "s/explorer-quiz/ending/keeper",
  )!.html;
  expect(result).toContain("I got “The Keeper” in What Kind of Explorer");
  expect(result).toContain('name="storybranch:result"');
});
