import { expect, it } from "vitest";
import { draftSchema } from "../packages/contracts/authoring";
import {
  connections,
  connectStoryNode,
  arrangeStoryNodes,
} from "../packages/domain/story-graph";

it("persists actual mixed draft graphs and reconnects battle outputs without rewriting bindings", () => {
  const story = fixture();
  fight(story).outputs.win.inputBindings = {
    version: 1,
    bindings: [{ input: "won", source: { kind: "battle", field: "won" } }],
  };
  const draft = draftSchema.parse({ story, description: "Battle draft" });
  expect(draft.story.storyNodes.fight).toEqual(story.storyNodes.fight);
  expect(
    connections(story.storyNodes.fight).map((edge) => edge.choiceId),
  ).toEqual(["win", "loss", "escape"]);
  const updated = connectStoryNode(
    story,
    "fight",
    { choiceId: "win", slot: 0 },
    "opening",
  );
  expect(fight(updated).outputs.win).toEqual({
    ...fight(story).outputs.win,
    targetStoryNodeId: "opening",
  });
  expect(fight(updated).outputs.loss).toEqual(fight(story).outputs.loss);
  expect(fight(story).outputs.win.targetStoryNodeId).toBe("ending");
  expect(Object.keys(arrangeStoryNodes(updated))).toEqual(
    Object.keys(updated.storyNodes),
  );
  expect(() =>
    connectStoryNode(story, "fight", { choiceId: "win", slot: 1 }, "ending"),
  ).toThrow();
  expect(() =>
    connectStoryNode(story, "fight", { choiceId: "other", slot: 0 }, "ending"),
  ).toThrow();
  expect(reviewPublication(draft.story).story).toBeUndefined();
  fight(story).outputs.loss.targetStoryNodeId = "unfinished";
  expect(
    draftSchema.safeParse({ story, description: "Incomplete battle" }).success,
  ).toBe(true);
  expect(reviewBattleGraph(story).story?.storyNodes.fight).toBeUndefined();
});
import { starterStory } from "../apps/web/src/studio-model";
import { reviewBattleGraph } from "../packages/domain/battle-graph";
import { reviewPublication } from "../packages/domain/authoring";
import {
  stagedBattleStorySchema,
  type StagedBattleStory,
  type StagedBattleNode,
} from "../packages/contracts/battle-graph";
const direct = (id: string, target: string) => ({
  id,
  label: id,
  costs: [],
  unavailableDisplay: "hidden" as const,
  outcome: {
    kind: "direct" as const,
    route: { targetStoryNodeId: target, effects: [] },
  },
});
function fixture(): StagedBattleStory {
  const story = starterStory("battle-graph");
  story.storyNodes.opening.storyNodeType = "text-options";
  story.storyNodes.opening.choices = [
    direct("fight", "fight"),
    direct("leave", "ending"),
  ];
  const battle: StagedBattleNode = {
    id: "fight",
    title: "Fight",
    transcript: "Test",
    kind: "scene",
    storyNodeType: "battle",
    entryEffects: [],
    battle: {
      version: 1,
      rules: "battle-1",
      enemy: {
        name: "Guard",
        maxHealth: 10,
        attack: 5,
        defense: 1,
        agility: 4,
      },
      maxTurns: 10,
    },
    outputs: {
      win: { targetStoryNodeId: "ending", effects: [] },
      loss: { targetStoryNodeId: "ending", effects: [] },
      escape: { targetStoryNodeId: "ending", effects: [] },
    },
  };
  return { ...story, storyNodes: { ...story.storyNodes, fight: battle } };
}
function fight(story: StagedBattleStory, id = "fight") {
  const n = story.storyNodes[id];
  if (n.storyNodeType !== "battle") throw Error("Fixture");
  return n;
}
it("compiles mixed graphs, preserves battle configuration and keeps live publication disabled", () => {
  const story = fixture(),
    before = JSON.stringify(story),
    review = reviewBattleGraph(story);
  expect(review.error).toBeUndefined();
  expect(review.story?.storyNodes.fight).toEqual(story.storyNodes.fight);
  expect(JSON.stringify(story)).toBe(before);
  expect(reviewPublication(story).story).toBeUndefined();
  expect(reviewBattleGraph(review.story).story).toEqual(review.story);
});
it.each(["win", "loss", "escape"] as const)(
  "suppresses the entire battle and incoming option when %s is unsafe",
  (outcome) => {
    const story = fixture();
    fight(story).outputs[outcome].targetStoryNodeId = "unfinished";
    const review = reviewBattleGraph(story);
    expect(review.story?.storyNodes.fight).toBeUndefined();
    const opening = review.story!.storyNodes.opening;
    if (opening.storyNodeType === "battle") throw Error("fixture");
    expect(opening.choices.map((c) => c.id)).toEqual(["leave"]);
    expect(
      review.diagnostics.some(
        (d) => d.storyNodeId === "fight" && d.message.includes(outcome),
      ),
    ).toBe(true);
    story.entryStoryNodeId = "fight";
    expect(reviewBattleGraph(story).story).toBeUndefined();
  },
);
it("propagates unsafe battle outcomes through preceding battles and Dice alternatives", () => {
  const story = fixture(),
    second = structuredClone(fight(story));
  second.id = "second";
  second.outputs.loss.targetStoryNodeId = "missing";
  story.storyNodes.second = second;
  fight(story).outputs.win.targetStoryNodeId = "second";
  const roll = direct("roll", "fight");
  story.storyNodes.dice = {
    id: "dice",
    title: "Dice",
    transcript: "",
    kind: "scene",
    storyNodeType: "dice",
    entryEffects: [],
    choices: [
      {
        ...roll,
        outcome: {
          kind: "dice",
          sides: 20,
          target: 16,
          success: roll.outcome.route,
          failure: { targetStoryNodeId: "ending", effects: [] },
        },
      },
    ],
  };
  const opening = story.storyNodes.opening;
  if (opening.storyNodeType === "battle") throw Error("fixture");
  opening.choices[0] = direct("risk", "dice");
  const review = reviewBattleGraph(story);
  expect(Object.keys(review.story!.storyNodes).sort()).toEqual([
    "ending",
    "opening",
  ]);
});
it("checks entry battle defaults and every required mapped declaration", () => {
  const story = fixture(),
    node = fight(story);
  story.entryStoryNodeId = "fight";
  node.battle.inputs = { attackBonus: "power" };
  node.inputs = {
    version: 1,
    fields: [{ name: "power", type: "integer", required: true, default: 10 }],
  };
  expect(reviewBattleGraph(story).story).toBeDefined();
  node.inputs.fields[0].default = 11;
  expect(reviewBattleGraph(story).story).toBeUndefined();
  node.inputs.fields[0].default = 1;
  node.inputs.fields[0].required = false;
  expect(reviewBattleGraph(story).story).toBeUndefined();
});
it("suppresses only invalid incoming constants while preserving valid entry to the battle", () => {
  const story = fixture(),
    node = fight(story);
  node.battle.inputs = { attackBonus: "power" };
  node.inputs = {
    version: 1,
    fields: [{ name: "power", type: "integer", required: true }],
  };
  const opening = story.storyNodes.opening;
  if (opening.storyNodeType === "battle") throw Error("fixture");
  opening.choices = [
    direct("good", "fight"),
    direct("bad", "fight"),
    direct("leave", "ending"),
  ];
  for (const [i, value] of [10, 11].entries()) {
    const c = opening.choices[i];
    if (c.outcome.kind !== "direct") throw Error("fixture");
    c.outcome.route.inputBindings = {
      version: 1,
      bindings: [{ input: "power", source: { kind: "constant", value } }],
    };
  }
  const reviewed = reviewBattleGraph(story);
  expect(reviewed.story?.storyNodes.fight).toBeDefined();
  const kept = reviewed.story!.storyNodes.opening;
  if (kept.storyNodeType === "battle") throw Error("fixture");
  expect(kept.choices.map((c) => c.id)).toEqual(["good", "leave"]);
});
it("rejects an out-of-range Dice alternative without converting its result into a constant", () => {
  const story = fixture(),
    node = fight(story);
  node.battle.inputs = { attackBonus: "power" };
  node.inputs = {
    version: 1,
    fields: [{ name: "power", type: "integer", required: true }],
  };
  const route = {
    targetStoryNodeId: "fight",
    effects: [],
    inputBindings: {
      version: 1 as const,
      bindings: [
        {
          input: "power",
          source: { kind: "dice" as const, field: "value" as const },
        },
      ],
    },
  };
  story.storyNodes.dice = {
    id: "dice",
    title: "Roll",
    transcript: "",
    kind: "scene",
    storyNodeType: "dice",
    entryEffects: [],
    choices: [
      {
        id: "roll",
        label: "Roll",
        costs: [],
        unavailableDisplay: "hidden",
        outcome: {
          kind: "dice",
          sides: 20,
          target: 16,
          success: route,
          failure: route,
        },
      },
    ],
  };
  const opening = story.storyNodes.opening;
  if (opening.storyNodeType === "battle") throw Error("fixture");
  opening.choices[0] = direct("roll", "dice");
  expect(reviewBattleGraph(story).story?.storyNodes.dice).toBeUndefined();
  const dice = story.storyNodes.dice;
  if (dice.choices[0].outcome.kind !== "dice") throw Error("fixture");
  dice.choices[0].outcome.sides = 10;
  dice.choices[0].outcome.target = 5;
  const review = reviewBattleGraph(story);
  expect(review.story?.storyNodes.dice).toEqual(dice);
});
it("proves battle-to-battle result bounds and preserves real bindings in the returned graph", () => {
  const story = fixture(),
    first = fight(story),
    second = structuredClone(first);
  second.id = "second";
  second.inputs = {
    version: 1,
    fields: [{ name: "power", type: "integer", required: true }],
  };
  second.battle.inputs = { attackBonus: "power" };
  story.storyNodes.second = second;
  first.outputs.win = {
    targetStoryNodeId: "second",
    effects: [],
    inputBindings: {
      version: 1,
      bindings: [
        { input: "power", source: { kind: "battle", field: "turns" } },
      ],
    },
  };
  let review = reviewBattleGraph(story);
  expect(review.story?.storyNodes.fight).toEqual(first);
  expect(review.story?.storyNodes.second).toEqual(second);
  first.battle.maxTurns = 11;
  review = reviewBattleGraph(story);
  expect(review.story?.storyNodes.fight).toBeUndefined();
  first.outputs.win.inputBindings!.bindings[0].source = {
    kind: "battle",
    field: "enemyHealth",
  };
  expect(reviewBattleGraph(story).story?.storyNodes.fight).toBeDefined();
  first.outputs.win.inputBindings!.bindings[0].source = {
    kind: "battle",
    field: "playerHealth",
  };
  expect(reviewBattleGraph(story).story?.storyNodes.fight).toBeUndefined();
});
it("accepts won as a boolean preemptive input on following battles", () => {
  const story = fixture(),
    first = fight(story),
    second = structuredClone(first);
  second.id = "second";
  second.inputs = {
    version: 1,
    fields: [{ name: "surprise", type: "boolean", required: true }],
  };
  second.battle.inputs = { preemptive: "surprise" };
  story.storyNodes.second = second;
  first.outputs.win = {
    targetStoryNodeId: "second",
    effects: [],
    inputBindings: {
      version: 1,
      bindings: [
        { input: "surprise", source: { kind: "battle", field: "won" } },
      ],
    },
  };
  expect(reviewBattleGraph(story).story?.storyNodes.second).toBeDefined();
});
it("keeps all-required cycles unsafe and rejects inventory effects on required outcomes", () => {
  const story = fixture();
  fight(story).outputs.win.targetStoryNodeId = "fight";
  expect(reviewBattleGraph(story).story?.storyNodes.fight).toBeUndefined();
  fight(story).outputs.win.targetStoryNodeId = "ending";
  fight(story).outputs.escape.effects = [
    { id: "cost", kind: "item", itemId: "battle-graph:coin", delta: -1 },
  ];
  expect(reviewBattleGraph(story).story?.storyNodes.fight).toBeUndefined();
});
it("rejects excess nodes, battle leaf/media/choice fields and foreign namespaces", () => {
  const story = fixture();
  for (const extra of [
    { kind: "ending" },
    { video: "/media/test.mp4" },
    { choices: [] },
  ])
    expect(
      stagedBattleStorySchema.safeParse({
        ...story,
        storyNodes: {
          ...story.storyNodes,
          fight: { ...fight(story), ...extra },
        },
      }).success,
    ).toBe(false);
  story.itemCatalogue = {
    version: 1,
    items: [{ itemId: "foreign:coin", name: "Coin", description: "" }],
  };
  expect(reviewBattleGraph(story).story).toBeUndefined();
  delete story.itemCatalogue;
  for (let i = 0; i < 80; i++)
    story.storyNodes[`leaf${i}`] = {
      ...story.storyNodes.ending,
      id: `leaf${i}`,
    };
  expect(stagedBattleStorySchema.safeParse(story).success).toBe(false);
});
it("leaves ordinary graph compilation behavior unchanged", () => {
  const story = starterStory("ordinary");
  expect(reviewBattleGraph(story)).toEqual(reviewPublication(story));
});
