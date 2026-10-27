import { type Story, type Save } from "../contracts/index";
import {
  previewScenarioSchema,
  playtestStepSchema,
  type PreviewScenario,
  type PlaytestStep,
} from "../contracts/preview";
import { transition } from "./index";
import { startPreview, previewScenarioIssues } from "./preview";
import { validatePublication } from "./authoring";

export function recordPreviewStep(
  story: Story,
  save: Save,
  scenario: PreviewScenario,
  history: PlaytestStep[],
  choiceId: string,
  action: "roll" | "continue",
  now: number,
) {
  if (history.length >= 100)
    throw new Error(
      "Preview history reached 100 commands. Restart preview to record another path.",
    );
  const dice = scenario.dice;
  const moved = transition(
    story,
    save,
    choiceId,
    save.revision,
    now,
    (sides) =>
      dice?.mode === "fixed" ? dice.value : dice?.mode === "lowest" ? 1 : sides,
    action,
    scenario.accountKeys,
  );
  const step = playtestStepSchema.parse({
    from: save.storyNodeId,
    choiceId,
    action,
    ...(action === "roll" ? { roll: moved.save.lastRoll?.value } : {}),
    expected: {
      storyNodeId: moved.save.storyNodeId,
      status: moved.save.status,
    },
  });
  return { save: moved.save, history: [...history, step] };
}

export type PlaytestReport = {
  passed: boolean;
  checked: number;
  total: number;
  message: string;
};
// Pure, bounded rule simulation. Never runs media, real commands or account grants.
export function runPlaytest(
  draft: Story,
  input: PreviewScenario,
): PlaytestReport {
  let checked = 0,
    total = 0;
  try {
    const scenario = previewScenarioSchema.parse(input);
    const steps = scenario.replay?.steps;
    if (!steps?.length)
      throw new Error("Capture a path before running assertions.");
    total = steps.length;
    const story = validatePublication(draft);
    const issues = previewScenarioIssues(story, scenario);
    if (issues.length) throw new Error(issues.join(" "));
    let save = startPreview(story, scenario, 0);
    for (const [index, step] of steps.entries()) {
      if (save.storyNodeId !== step.from)
        throw new Error(
          `Step ${index + 1}: expected source ${step.from}, actual ${save.storyNodeId}.`,
        );
      try {
        save = transition(
          story,
          save,
          step.choiceId,
          save.revision,
          index + 1,
          () => step.roll!,
          step.action,
          scenario.accountKeys,
        ).save;
      } catch (e) {
        throw new Error(`Step ${index + 1}: ${(e as Error).message}`);
      }
      if (
        save.storyNodeId !== step.expected.storyNodeId ||
        save.status !== step.expected.status
      )
        throw new Error(
          `Step ${index + 1}: expected ${step.expected.storyNodeId} (${step.expected.status}), actual ${save.storyNodeId} (${save.status}).`,
        );
      checked++;
    }
    return {
      passed: true,
      checked,
      total,
      message: `${checked} assertions passed. ${save.status === "completed" ? "Story completed." : "Partial path; Story still active."}`,
    };
  } catch (e) {
    return {
      passed: false,
      checked,
      total,
      message:
        e instanceof Error && e.name !== "ZodError"
          ? e.message
          : "Invalid playtest format or bounds.",
    };
  }
}
