import {
  stagedBattleStorySchema,
  type StagedBattleStory,
  type StagedBattleNode,
} from "../contracts/battle-graph";
import type { Story, StoryNode, Choice } from "../contracts/index";
import type { BattleOutputs } from "../contracts/battle-routing";
import { reviewGraph, type StoryDiagnostic } from "./authoring";
import { routesOf } from "./index";
import { validateBattleEntry } from "./battle";

// Type/range witnesses only. Never used as actual resolved runtime values.
function proofRoute(node: StagedBattleNode, outcome: keyof BattleOutputs) {
  const route = node.outputs[outcome];
  return {
    targetStoryNodeId: route.targetStoryNodeId,
    effects: route.effects,
    ...(route.inputBindings
      ? {
          inputBindings: {
            version: 1 as const,
            bindings: route.inputBindings.bindings.map((b) => ({
              input: b.input,
              source: {
                kind: "constant" as const,
                value:
                  b.source.kind === "constant"
                    ? b.source.value
                    : b.source.field === "won"
                      ? outcome === "win"
                      : b.source.field === "turns"
                        ? node.battle.maxTurns
                        : b.source.field === "playerHealth"
                          ? 100
                          : outcome === "win"
                            ? 0
                            : node.battle.enemy.maxHealth,
              },
            })),
          },
        }
      : {}),
  };
}
function proofNode(node: StagedBattleNode): StoryNode {
  return {
    id: node.id,
    title: node.title,
    transcript: node.transcript,
    kind: "scene",
    storyNodeType: "text-options",
    inputs: node.inputs,
    entryEffects: node.entryEffects,
    choices: (["win", "loss", "escape"] as const).map((outcome) => ({
      id: outcome,
      label: outcome,
      costs: [],
      unavailableDisplay: "hidden",
      outcome: { kind: "direct", route: proofRoute(node, outcome) },
    })),
  };
}
export function reviewBattleGraph(input: unknown): {
  story?: StagedBattleStory;
  diagnostics: StoryDiagnostic[];
  error?: string;
} {
  try {
    const draft = stagedBattleStorySchema.parse(input);
    const required = new Set<string>();
    const proof: Story = { ...draft, storyNodes: {} };
    for (const [id, node] of Object.entries(draft.storyNodes)) {
      if (node.storyNodeType === "battle") {
        required.add(node.id);
        proof.storyNodes[id] = proofNode(node);
      } else proof.storyNodes[id] = node;
    }
    const check = (fn: () => void) => {
      try {
        fn();
        return undefined;
      } catch (e) {
        return e instanceof Error ? e.message : "Invalid battle inputs.";
      }
    };
    const reviewed = reviewGraph(proof, {
      allChoicesRequired: required,
      entryIssue: () =>
        check(() => {
          const entry = draft.storyNodes[draft.entryStoryNodeId];
          if (entry?.storyNodeType === "battle")
            validateBattleEntry(entry.battle, entry.inputs);
        }),
      choiceIssue: (_sourceId: string, choice: Choice) =>
        check(() => {
          for (const route of routesOf(choice)) {
            const target = draft.storyNodes[route.targetStoryNodeId];
            if (target?.storyNodeType === "battle")
              validateBattleEntry(
                target.battle,
                target.inputs,
                route.inputBindings,
                choice.outcome.kind === "dice"
                  ? {
                      sides: choice.outcome.sides,
                      target: choice.outcome.target,
                    }
                  : undefined,
              );
          }
        }),
    });
    if (!reviewed.story)
      return { diagnostics: reviewed.diagnostics, error: reviewed.error };
    const story: StagedBattleStory = { ...draft, storyNodes: {} };
    for (const [id, node] of Object.entries(reviewed.story.storyNodes)) {
      const original = draft.storyNodes[id];
      story.storyNodes[id] =
        original.storyNodeType === "battle" ? original : node;
    }
    return { story, diagnostics: reviewed.diagnostics };
  } catch (e) {
    return {
      diagnostics: [],
      error: e instanceof Error ? e.message : "Invalid battle graph.",
    };
  }
}
