import { GameError } from "../contracts/index";
import type { StagedBattleStory } from "../contracts/battle-graph";
import type { BattleSave } from "../contracts/battle-player";
import {
  battlePlaytestIntentSchema,
  battlePlaytestReplaySchema,
  battlePlaytestScenarioSchema,
  battlePlaytestStepSchema,
  type BattlePlaytestIntent,
  type BattlePlaytestStep,
} from "../contracts/battle-playtest";
import { reviewBattleGraph } from "./battle-graph";
import {
  initializeBattle,
  advanceBattle,
  advanceBattleChoice,
} from "./battle-player";
import { startPreview, previewScenarioIssues } from "./preview";
import type { PlaytestReport } from "./playtest";

export function startBattlePreview(draft: unknown, input: unknown, now = 0) {
  const scenario = battlePlaytestScenarioSchema.parse(input);
  const reviewed = reviewBattleGraph(draft);
  if (!reviewed.story)
    throw new GameError(
      "VALIDATION_FAILED",
      reviewed.error ?? "No safe battle preview start.",
    );
  const story = reviewed.story;
  const issues = previewScenarioIssues(story, scenario);
  if (issues.length) throw new GameError("VALIDATION_FAILED", issues.join(" "));
  const save = initializeBattle(story, startPreview(story, scenario, now));
  return { story, save };
}
function expectation(save: BattleSave): BattlePlaytestStep["expected"] {
  const battle = save.battle;
  return {
    storyNodeId: save.storyNodeId,
    status: save.status,
    health: save.health,
    battle: battle
      ? {
          phase: battle.phase,
          turns: battle.turns,
          playerHealth: save.health,
          enemyHealth: battle.enemyHealth,
          outcome:
            battle.phase === "result-pending" ? battle.result.outcome : null,
        }
      : null,
  };
}
function advance(
  story: StagedBattleStory,
  save: BattleSave,
  intent: BattlePlaytestIntent,
  now: number,
  draw: (sides: number) => number,
  keys: readonly string[],
) {
  if (save.id !== "preview" || save.playerUid !== "preview")
    throw new GameError(
      "VALIDATION_FAILED",
      "Playtests require disposable preview state.",
    );
  const scope = {
    idempotencyKey: "preview-command",
    expectedRevision: save.revision,
  };
  if (intent.kind === "choice")
    return advanceBattleChoice(
      story,
      save,
      {
        ...scope,
        payload: { choiceId: intent.choiceId, action: intent.action },
      },
      now,
      draw,
      keys,
    ).save;
  if (!save.battle)
    throw new GameError("VALIDATION_FAILED", "No battle at this StoryNode.");
  return advanceBattle(
    story,
    save,
    {
      ...scope,
      payload: {
        battleId: save.battle.battleId,
        expectedTurn: save.battle.turns,
        action: intent.action,
      },
    },
    now,
  ).save;
}
export function recordBattlePreviewStep(
  story: StagedBattleStory,
  save: BattleSave,
  input: unknown,
  history: BattlePlaytestStep[],
  intentInput: unknown,
  now: number,
) {
  if (history.length >= 100)
    throw new GameError(
      "VALIDATION_FAILED",
      "Preview history reached 100 commands. Restart preview to record another path.",
    );
  const scenario = battlePlaytestScenarioSchema.parse(input),
    intent = battlePlaytestIntentSchema.parse(intentInput);
  const issues = previewScenarioIssues(story, scenario);
  if (issues.length) throw new GameError("VALIDATION_FAILED", issues.join(" "));
  const previous = history.map((step) => battlePlaytestStepSchema.parse(step));
  const dice = scenario.dice;
  const next = advance(
    story,
    save,
    intent,
    now,
    (sides) =>
      dice?.mode === "fixed" ? dice.value : dice?.mode === "lowest" ? 1 : sides,
    scenario.accountKeys,
  );
  const step = battlePlaytestStepSchema.parse({
    from: save.storyNodeId,
    intent,
    ...(intent.kind === "choice" && intent.action === "roll"
      ? { roll: next.lastRoll?.value }
      : {}),
    expected: expectation(next),
  });
  return { save: next, history: [...previous, step] };
}
export function runBattlePlaytest(
  draft: unknown,
  input: unknown,
  replayInput: unknown,
): PlaytestReport {
  let checked = 0,
    total = 0;
  try {
    const scenario = battlePlaytestScenarioSchema.parse(input),
      replay = battlePlaytestReplaySchema.parse(replayInput);
    total = replay.steps.length;
    const preview = startBattlePreview(draft, scenario);
    let save = preview.save;
    for (const [index, step] of replay.steps.entries()) {
      try {
        if (save.storyNodeId !== step.from)
          throw new Error(
            `Expected source ${step.from}, actual ${save.storyNodeId}.`,
          );
        save = advance(
          preview.story,
          save,
          step.intent,
          index + 1,
          () => step.roll!,
          scenario.accountKeys,
        );
        const actual = expectation(save);
        if (JSON.stringify(actual) !== JSON.stringify(step.expected))
          throw new Error(
            `Expected ${JSON.stringify(step.expected)}, actual ${JSON.stringify(actual)}.`,
          );
        checked++;
      } catch (error) {
        throw new Error(`Step ${index + 1}: ${(error as Error).message}`);
      }
    }
    return {
      passed: true,
      checked,
      total,
      message: `${checked} assertions passed. ${save.status === "completed" ? "Story completed." : "Partial path; Story still active."}`,
    };
  } catch (error) {
    return {
      passed: false,
      checked,
      total,
      message:
        error instanceof Error && error.name !== "ZodError"
          ? error.message
          : "Invalid playtest format or bounds.",
    };
  }
}
