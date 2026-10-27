import { expect, it } from "vitest";
import { starterStory } from "../apps/web/src/studio-model";
import { stagedBattleStorySchema } from "../packages/contracts/battle-graph";
import {
  battlePlaytestReplaySchema,
  type BattlePlaytestStep,
} from "../packages/contracts/battle-playtest";
import { previewScenarioSchema } from "../packages/contracts/preview";
import { storySchema, startSchema } from "../packages/contracts/index";
import {
  startBattlePreview,
  recordBattlePreviewStep,
  runBattlePlaytest,
} from "../packages/domain/battle-playtest";
import { itemReferences } from "../packages/domain/story-items";
const scenario = {
  version: 1,
  storyKeys: [],
  importedKeys: [],
  accountKeys: [],
} as const;
function fixture(dice = false) {
  const base = starterStory("battle-playtest");
  const battle = {
    id: "fight",
    title: "Fight",
    transcript: "A guard.",
    kind: "scene",
    storyNodeType: "battle",
    entryEffects: [],
    battle: {
      version: 1,
      rules: "battle-1",
      enemy: { name: "Guard", maxHealth: 1, attack: 4, defense: 0, agility: 1 },
      maxTurns: 3,
    },
    outputs: Object.fromEntries(
      ["win", "loss", "escape"].map((outcome) => [
        outcome,
        { targetStoryNodeId: "ending", effects: [] },
      ]),
    ),
  };
  const story = stagedBattleStorySchema.parse({
    ...base,
    entryStoryNodeId: dice ? "opening" : "fight",
    storyNodes: { ...base.storyNodes, fight: battle },
  });
  if (dice) {
    const node = story.storyNodes.opening;
    if (node.storyNodeType === "battle") throw Error();
    node.storyNodeType = "dice";
    node.choices = [
      {
        id: "roll",
        label: "Roll",
        costs: [],
        unavailableDisplay: "hidden",
        outcome: {
          kind: "dice",
          sides: 20,
          target: 16,
          success: { targetStoryNodeId: "fight", effects: [] },
          failure: { targetStoryNodeId: "fight", effects: [] },
        },
      },
    ];
  }
  return story;
}
function record(story = fixture(), actions = ["attack", "continue"]) {
  const preview = startBattlePreview(story, scenario);
  let save = preview.save,
    history: BattlePlaytestStep[] = [];
  for (const action of actions)
    ({ save, history } = recordBattlePreviewStep(
      preview.story,
      save,
      scenario,
      history,
      action === "again"
        ? { kind: "choice", choiceId: "again", action: "continue" }
        : { kind: "battle", action },
      history.length + 1,
    ));
  return {
    story: preview.story,
    save,
    history,
    replay: { version: 1, steps: history },
  };
}
it.each([
  ["attack", "win"],
  ["escape", "escape"],
  ["guard", "loss"],
])(
  "records %s with explicit result and Continue, replays %s",
  (action, outcome) => {
    const draft = fixture();
    if (action === "guard") {
      const n = draft.storyNodes.fight;
      if (n.storyNodeType === "battle") n.battle.maxTurns = 1;
    }
    const original = structuredClone(draft);
    const result = record(draft, [action, "continue"]);
    expect(result.history[0].expected.battle).toMatchObject({
      phase: "result-pending",
      outcome,
    });
    expect(result.history[0].expected.status).toBe("active");
    expect(result.history[1].expected).toMatchObject({
      storyNodeId: "ending",
      status: "completed",
      battle: null,
    });
    expect(runBattlePlaytest(draft, scenario, result.replay)).toMatchObject({
      passed: true,
      checked: 2,
      total: 2,
    });
    expect(draft).toEqual(original);
  },
);
it("records Dice Roll/Next separately and replays the captured draw independently of current controls", () => {
  const draft = fixture(true),
    preview = startBattlePreview(draft, scenario);
  let { save } = preview;
  let history: BattlePlaytestStep[] = [];
  for (const intent of [
    { kind: "choice", choiceId: "roll", action: "roll" },
    { kind: "choice", choiceId: "roll", action: "continue" },
    { kind: "battle", action: "attack" },
    { kind: "battle", action: "continue" },
  ])
    ({ save, history } = recordBattlePreviewStep(
      preview.story,
      save,
      { ...scenario, dice: { mode: "fixed", value: 14 } },
      history,
      intent,
      history.length + 1,
    ));
  expect(history[0]).toMatchObject({
    roll: 14,
    expected: { storyNodeId: "opening", battle: null },
  });
  expect(history[1].expected.battle).toMatchObject({
    phase: "active",
    turns: 0,
  });
  expect(
    runBattlePlaytest(
      draft,
      { ...scenario, dice: { mode: "fixed", value: 20 } },
      { version: 1, steps: history },
    ).passed,
  ).toBe(true);
  const altered = structuredClone(history);
  altered[0].roll = 21;
  expect(
    runBattlePlaytest(draft, scenario, { version: 1, steps: altered }),
  ).toMatchObject({ passed: false, checked: 0 });
});
it("fails at the first changed battle or expectation, reporting checked steps and actual state", () => {
  const result = record(),
    changed = structuredClone(result.story),
    n = changed.storyNodes.fight;
  if (n.storyNodeType === "battle") n.battle.enemy.maxHealth = 100;
  const failed = runBattlePlaytest(changed, scenario, result.replay);
  expect(failed).toMatchObject({ passed: false, checked: 0, total: 2 });
  expect(failed.message).toContain("Step 1: Expected");
  const replay = structuredClone(result.replay);
  replay.steps[1].expected.health = 0;
  expect(runBattlePlaytest(result.story, scenario, replay)).toMatchObject({
    passed: false,
    checked: 1,
    total: 2,
  });
});
it("reports partial paths without claiming Story completion", () => {
  const result = record(fixture(), ["guard"]);
  const report = runBattlePlaytest(result.story, scenario, result.replay);
  expect(report.passed).toBe(true);
  expect(report.message).toContain("Partial path");
});
it("preserves preview and history when a battle intent or Dice draw is rejected", () => {
  const preview = startBattlePreview(fixture(), scenario),
    before = structuredClone(preview.save);
  const history: BattlePlaytestStep[] = [];
  expect(() =>
    recordBattlePreviewStep(
      preview.story,
      preview.save,
      scenario,
      history,
      { kind: "battle", action: "continue" },
      1,
    ),
  ).toThrow();
  expect(preview.save).toEqual(before);
  expect(history).toEqual([]);
  const dice = startBattlePreview(fixture(true), scenario),
    original = structuredClone(dice.save);
  expect(() =>
    recordBattlePreviewStep(
      dice.story,
      dice.save,
      { ...scenario, dice: { mode: "fixed", value: 21 } },
      [],
      { kind: "choice", choiceId: "roll", action: "roll" },
      1,
    ),
  ).toThrow();
  expect(dice.save).toEqual(original);
});
it("rejects real save state and enforces history and replay bounds", () => {
  const preview = startBattlePreview(fixture(), scenario),
    step = record().history[0];
  expect(() =>
    recordBattlePreviewStep(
      preview.story,
      { ...preview.save, id: "real-run" },
      scenario,
      [],
      { kind: "battle", action: "attack" },
      1,
    ),
  ).toThrow("disposable");
  expect(() =>
    recordBattlePreviewStep(
      preview.story,
      preview.save,
      scenario,
      Array(100).fill(step),
      { kind: "battle", action: "attack" },
      1,
    ),
  ).toThrow("100");
  expect(
    battlePlaytestReplaySchema.safeParse({ version: 1, steps: [] }).success,
  ).toBe(false);
  expect(
    battlePlaytestReplaySchema.safeParse({
      version: 1,
      steps: Array(101).fill(step),
    }).success,
  ).toBe(false);
});
it("rejects forged intent, draw fields on battles and invalid phase/outcome assertions", () => {
  const result = record();
  for (const step of [
    { ...result.history[0], roll: 20 },
    {
      ...result.history[0],
      intent: { kind: "battle", action: "attack", damage: 100 },
    },
    {
      ...result.history[0],
      expected: {
        ...result.history[0].expected,
        battle: { ...result.history[0].expected.battle, phase: "active" },
      },
    },
  ])
    expect(
      battlePlaytestReplaySchema.safeParse({ version: 1, steps: [step] })
        .success,
    ).toBe(false);
});
it("fails unsafe graphs and stale scenario references without modifying the draft", () => {
  const draft = fixture(),
    original = structuredClone(draft),
    result = record(draft);
  expect(() =>
    startBattlePreview(draft, {
      ...scenario,
      accountKeys: ["battle-playtest:undeclared"],
    }),
  ).toThrow("unavailable");
  const n = draft.storyNodes.fight;
  if (n.storyNodeType === "battle")
    n.outputs.loss.targetStoryNodeId = "missing";
  expect(runBattlePlaytest(draft, scenario, result.replay).passed).toBe(false);
  expect(original.storyNodes.ending).toEqual(draft.storyNodes.ending);
});
it("uses declared simulated keys/items and entry effects before initializing combat", () => {
  const draft = fixture();
  draft.itemCatalogue = {
    version: 1,
    items: [
      { itemId: "battle-playtest:potion", name: "Potion", description: "" },
    ],
  };
  draft.progression = {
    version: 1,
    keys: [
      { keyId: "battle-playtest:earned", label: "Earned", afterCompletions: 1 },
    ],
  };
  draft.storyNodes.fight.entryEffects = [
    { id: "hurt", kind: "health", delta: -10 },
  ];
  const result = startBattlePreview(draft, {
    ...scenario,
    storyKeys: ["battle-playtest:earned"],
    items: { "battle-playtest:potion": 2 },
  });
  expect(result.save.health).toBe(90);
  expect(result.save.items["battle-playtest:potion"]).toBe(2);
  expect(result.save.storyProgressSnapshot?.keys).toEqual([
    "battle-playtest:earned",
  ]);
  const n = draft.storyNodes.fight;
  if (n.storyNodeType === "battle")
    n.outputs.win.effects = [
      { id: "item", kind: "item", itemId: "battle-playtest:potion", delta: 1 },
    ];
  expect(itemReferences(draft)).toContainEqual(
    expect.objectContaining({
      itemId: "battle-playtest:potion",
      path: "outputs.win.effects.0",
    }),
  );
});
it("keeps staged replays and battle graphs outside current saved setups and public start contracts", () => {
  const result = record();
  expect(
    previewScenarioSchema.safeParse({ ...scenario, replay: result.replay })
      .success,
  ).toBe(false);
  expect(storySchema.safeParse(result.story).success).toBe(false);
  expect(
    startSchema.safeParse({
      idempotencyKey: "test",
      payload: { storyId: result.story.id, replay: result.replay },
    }).success,
  ).toBe(false);
});
it("rebuilds encounter identity across repeated visits while retaining entry effects once", () => {
  const draft = fixture(),
    fight = draft.storyNodes.fight;
  if (fight.storyNodeType !== "battle") throw Error();
  fight.entryEffects = [{ id: "once", kind: "health", delta: -5 }];
  fight.outputs.escape = { targetStoryNodeId: "opening", effects: [] };
  const opening = draft.storyNodes.opening;
  if (opening.storyNodeType === "battle") throw Error();
  opening.storyNodeType = "text-options";
  opening.choices.push({
    id: "again",
    label: "Fight again",
    costs: [],
    unavailableDisplay: "hidden",
    outcome: {
      kind: "direct",
      route: { targetStoryNodeId: "fight", effects: [] },
    },
  });
  const preview = startBattlePreview(draft, scenario),
    firstId = preview.save.battle!.battleId;
  let { save } = preview;
  let history: BattlePlaytestStep[] = [];
  for (const action of ["escape", "continue", "again", "attack", "continue"])
    ({ save, history } = recordBattlePreviewStep(
      preview.story,
      save,
      scenario,
      history,
      action === "again"
        ? { kind: "choice", choiceId: "again", action: "continue" }
        : { kind: "battle", action },
      history.length + 1,
    ));
  expect(history[2].expected.battle).toMatchObject({
    phase: "active",
    turns: 0,
  });
  expect(history[1].expected.health).toBe(95);
  expect(history[4].expected.health).toBe(95);
  expect(
    runBattlePlaytest(draft, scenario, { version: 1, steps: history }).passed,
  ).toBe(true);
  expect(preview.save.battle!.battleId).toBe(firstId);
});
it("fails stale sources and ordinary intents at battle nodes with a useful step number", () => {
  const result = record(),
    stale = structuredClone(result.replay);
  stale.steps[0].from = "removed";
  expect(runBattlePlaytest(result.story, scenario, stale).message).toContain(
    "Step 1: Expected source removed",
  );
  stale.steps[0] = {
    ...result.history[0],
    intent: { kind: "choice", choiceId: "next", action: "continue" },
  };
  expect(runBattlePlaytest(result.story, scenario, stale)).toMatchObject({
    passed: false,
    checked: 0,
  });
});
