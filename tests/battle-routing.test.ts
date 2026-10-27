import { expect, it } from "vitest";
import { starterStory } from "../apps/web/src/studio-model";
import { storySchema } from "../packages/contracts/index";
import { inputBindingsSchema } from "../packages/contracts/branch-data";
import { battleOutputsSchema } from "../packages/contracts/battle-routing";
import { startBattle, actBattle } from "../packages/domain/battle";
import {
  continueBattle,
  validateBattleOutputs,
} from "../packages/domain/battle-routing";
const config = {
  version: 1,
  rules: "battle-1",
  enemy: { name: "Guard", maxHealth: 1, attack: 20, defense: 0, agility: 1 },
  maxTurns: 10,
};
const stats = {
  strength: 8,
  agility: 8,
  resolve: 8,
  intellect: 8,
  charisma: 8,
};
const identity = {
  runId: "run",
  storyId: "routing",
  versionId: "edition-1",
  storyNodeId: "fight",
  entryRevision: 0,
};
function fixture() {
  const story = starterStory("routing");
  story.versionId = "edition-1";
  const leaf = story.storyNodes.ending;
  delete story.storyNodes.ending;
  story.storyNodes.opening.storyNodeType = "text-options";
  story.storyNodes.opening.choices = ["win", "loss", "escape"].map(
    (outcome) => ({
      id: outcome,
      label: outcome,
      costs: [],
      unavailableDisplay: "hidden",
      outcome: {
        kind: "direct",
        route: { targetStoryNodeId: outcome, effects: [] },
      },
    }),
  );
  for (const outcome of ["win", "loss", "escape"])
    story.storyNodes[outcome] = {
      ...structuredClone(leaf),
      id: outcome,
      inputs: {
        version: 1,
        fields: [
          { name: "victory", type: "boolean", required: true, default: false },
          { name: "hp", type: "integer", required: true, default: 1 },
          { name: "rounds", type: "integer", required: false, default: 0 },
          {
            name: "label",
            type: "string",
            required: false,
            default: "default",
          },
        ],
      },
    };
  const outputs = battleOutputsSchema.parse(
    Object.fromEntries(
      ["win", "loss", "escape"].map((outcome) => [
        outcome,
        {
          targetStoryNodeId: outcome,
          effects: [{ id: `${outcome}-health`, kind: "health", delta: 5 }],
          inputBindings: {
            version: 1,
            bindings: [
              { input: "victory", source: { kind: "battle", field: "won" } },
              {
                input: "hp",
                source: { kind: "battle", field: "playerHealth" },
              },
              { input: "rounds", source: { kind: "battle", field: "turns" } },
              { input: "label", source: { kind: "constant", value: outcome } },
            ],
          },
        },
      ]),
    ),
  );
  return { story, outputs };
}
function pending(outcome: "win" | "loss" | "escape") {
  const entry = startBattle(
    config,
    identity,
    outcome === "loss" ? 0 : 100,
    stats,
  );
  if (outcome === "loss") return { ...entry, revision: 0 };
  const next = actBattle(
    config,
    entry.state,
    entry.health,
    { identity, revision: 0, expectedRevision: 0 },
    {
      battleId: entry.state.battleId,
      expectedTurn: 0,
      action: outcome === "win" ? "attack" : "escape",
    },
  );
  if (next.kind !== "update") throw Error("Expected update");
  return next;
}
function route(outcome: "win" | "loss" | "escape") {
  const current = pending(outcome),
    { story, outputs } = fixture();
  const scope = {
    identity,
    revision: current.revision,
    expectedRevision: current.revision,
  };
  const intent = {
    battleId: current.state.battleId,
    expectedTurn: current.state.turns,
    action: "continue",
  };
  return { story, outputs, current, scope, intent };
}
it.each(["win", "loss", "escape"] as const)(
  "routes only persisted %s and binds its current terminal result without applying effects",
  (outcome) => {
    const x = route(outcome),
      before = JSON.stringify(x);
    const result = continueBattle(
      x.story,
      x.outputs,
      config,
      x.current.state,
      x.current.health,
      x.scope,
      x.intent,
    );
    expect(result.destination.id).toBe(outcome);
    expect(result.effects).toEqual(x.outputs[outcome].effects);
    expect(result.nodeInputs).toEqual({
      version: 1,
      storyNodeId: outcome,
      revision: x.current.revision + 1,
      values: {
        victory: outcome === "win",
        hp: x.current.health,
        rounds: x.current.state.turns,
        label: outcome,
      },
    });
    expect(result.revision).toBe(x.current.revision + 1);
    expect(JSON.stringify(x)).toBe(before);
    expect(
      continueBattle(
        x.story,
        x.outputs,
        config,
        x.current.state,
        x.current.health,
        x.scope,
        x.intent,
      ),
    ).toEqual(result);
  },
);
it("requires all three routes with no gating, costs, extra slots or Dice sources", () => {
  const { outputs } = fixture();
  for (const outcome of ["win", "loss", "escape"] as const) {
    const missing = structuredClone(outputs) as Partial<typeof outputs>;
    delete missing[outcome];
    expect(battleOutputsSchema.safeParse(missing).success).toBe(false);
  }
  for (const extra of [
    { availableWhen: { kind: "stat", stat: "strength", op: "gte", value: 1 } },
    { costs: [] },
    {
      inputBindings: {
        version: 1,
        bindings: [{ input: "hp", source: { kind: "dice", field: "value" } }],
      },
    },
  ])
    expect(
      battleOutputsSchema.safeParse({
        ...outputs,
        escape: { ...outputs.escape, ...extra },
      }).success,
    ).toBe(false);
  expect(
    battleOutputsSchema.safeParse({ ...outputs, timeout: outputs.loss })
      .success,
  ).toBe(false);
});
it.each(["win", "loss", "escape"] as const)(
  "rejects the whole plan if required %s destination is unsafe",
  (outcome) => {
    const { story, outputs } = fixture();
    story.storyNodes[outcome].kind = "scene";
    story.storyNodes[outcome].choices = [];
    expect(() => validateBattleOutputs(story, outputs)).toThrow(
      /missing or unsafe|safe starting/,
    );
  },
);
it("rejects destinations disconnected from the validated graph and missing targets", () => {
  const { story, outputs } = fixture();
  story.storyNodes.hidden = { ...story.storyNodes.win, id: "hidden" };
  outputs.escape.targetStoryNodeId = "hidden";
  expect(() => validateBattleOutputs(story, outputs)).toThrow("escape");
  outputs.escape.targetStoryNodeId = "missing";
  expect(() => validateBattleOutputs(story, outputs)).toThrow("escape");
});
it("checks destination types, unknown/duplicate names and required input sources", () => {
  const { story, outputs } = fixture();
  outputs.win.inputBindings!.bindings[0].input = "hp";
  expect(() => validateBattleOutputs(story, outputs)).toThrow();
  outputs.win.inputBindings!.bindings[0].input = "label";
  expect(() => validateBattleOutputs(story, outputs)).toThrow();
  outputs.win.inputBindings!.bindings[0].input = "unknown";
  expect(() => validateBattleOutputs(story, outputs)).toThrow();
  const clean = fixture();
  clean.story.storyNodes.win.inputs!.fields.push({
    name: "required",
    type: "integer",
    required: true,
    default: 0,
  });
  clean.outputs.win.inputBindings!.bindings.push({
    input: "required",
    source: { kind: "constant", value: 3 },
  });
  expect(() => validateBattleOutputs(clean.story, clean.outputs)).not.toThrow();
});
it("rejects unsafe inventory effects instead of exposing a potentially blocked required exit", () => {
  const { story, outputs } = fixture();
  outputs.loss.effects = [
    { id: "pay", kind: "item", itemId: "routing:coin", delta: -1 },
  ];
  expect(() => validateBattleOutputs(story, outputs)).toThrow(
    "inventory analysis",
  );
});
it("rejects active, forged, stale and foreign Story/edition Continue attempts", () => {
  const x = route("win");
  const call = (
    story = x.story,
    scope = x.scope,
    intent = x.intent,
    state = x.current.state,
    health = x.current.health,
  ) => continueBattle(story, x.outputs, config, state, health, scope, intent);
  expect(() => call({ ...x.story, id: "foreign" })).toThrow("edition mismatch");
  expect(() => call({ ...x.story, versionId: "edition-2" })).toThrow(
    "edition mismatch",
  );
  expect(() => call(x.story, { ...x.scope, expectedRevision: 0 })).toThrow();
  expect(() =>
    call(x.story, x.scope, { ...x.intent, action: "attack" }),
  ).toThrow();
  expect(() =>
    call(x.story, x.scope, { ...x.intent, battleId: "old" }),
  ).toThrow();
  const active = startBattle(config, identity, 100, stats);
  expect(() =>
    call(
      x.story,
      { identity, revision: 0, expectedRevision: 0 },
      { battleId: active.state.battleId, expectedTurn: 0, action: "continue" },
      active.state,
      100,
    ),
  ).toThrow();
});
it("keeps battle bindings out of current real Story schemas", () => {
  const { story, outputs } = fixture();
  expect(inputBindingsSchema.safeParse(outputs.win.inputBindings).success).toBe(
    false,
  );
  const first = story.storyNodes.opening.choices[0];
  if (first.outcome.kind !== "direct") throw Error("fixture");
  first.outcome.route.inputBindings = outputs.win.inputBindings as never;
  expect(storySchema.safeParse(story).success).toBe(false);
});

it("requires missing output inputs even when other incoming graph edges supply them", () => {
  const { story, outputs } = fixture();
  story.storyNodes.win.inputs!.fields.push({
    name: "ticket",
    type: "integer",
    required: true,
  });
  const opening = story.storyNodes.opening.choices[0];
  if (opening.outcome.kind !== "direct") throw Error("fixture");
  opening.outcome.route.inputBindings = {
    version: 1,
    bindings: [{ input: "ticket", source: { kind: "constant", value: 1 } }],
  };
  expect(() => validateBattleOutputs(story, outputs)).toThrow(
    "Required input has no source: ticket",
  );
  outputs.win.inputBindings!.bindings.push({
    input: "ticket",
    source: { kind: "constant", value: 2 },
  });
  expect(() => validateBattleOutputs(story, outputs)).not.toThrow();
});

it("bounds battle bindings and accepts maximum-length scoped identities", () => {
  const { outputs } = fixture();
  const invalid = structuredClone(outputs);
  invalid.win.inputBindings!.bindings = Array.from({ length: 17 }, (_, i) => ({
    input: `field${i}`,
    source: { kind: "constant" as const, value: 0 },
  }));
  expect(battleOutputsSchema.safeParse(invalid).success).toBe(false);
  const maxIdentity = {
    runId: "r".repeat(80),
    storyId: "s".repeat(80),
    versionId: "v".repeat(80),
    storyNodeId: "n".repeat(80),
    entryRevision: 0,
  };
  const started = startBattle(config, maxIdentity, 100, stats);
  const escape = actBattle(
    config,
    started.state,
    100,
    { identity: maxIdentity, revision: 0, expectedRevision: 0 },
    { battleId: started.state.battleId, expectedTurn: 0, action: "escape" },
  );
  expect(escape.kind).toBe("update");
  expect(
    startBattle(config, { ...identity, storyId: "other" }, 100, stats).state
      .battleId,
  ).not.toBe(started.state.battleId);
});
