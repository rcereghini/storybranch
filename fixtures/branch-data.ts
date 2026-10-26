import type { Choice, Story } from "../packages/contracts/index";

// Private test fixture only; not part of the seeded public catalogue.
export function branchDataStory(id = "branch-data"): Story {
  const next = (id: string, target: string): Choice => ({
    id,
    label: id,
    costs: [],
    unavailableDisplay: "hidden",
    outcome: {
      kind: "direct",
      route: { targetStoryNodeId: target, effects: [] },
    },
  });
  const result = () => ({
    targetStoryNodeId: "summary",
    effects: [],
    inputBindings: {
      version: 1 as const,
      bindings: [
        {
          input: "roll",
          source: { kind: "dice" as const, field: "value" as const },
        },
        {
          input: "passed",
          source: { kind: "dice" as const, field: "passed" as const },
        },
      ],
    },
  });
  return {
    id,
    title: "Branch data test",
    versionId: "draft",
    rulesetVersion: "prototype-1",
    entryStoryNodeId: "dice",
    storyNodes: {
      dice: {
        id: "dice",
        title: "Roll",
        transcript: "Scout the path.",
        kind: "scene",
        storyNodeType: "dice",
        entryEffects: [],
        inputs: {
          version: 1,
          fields: [
            { name: "attempt", type: "integer", required: true, default: 1 },
          ],
        },
        choices: [
          {
            ...next("roll", "summary"),
            label: "Roll d20",
            outcome: {
              kind: "dice",
              sides: 20,
              target: 16,
              success: result(),
              failure: result(),
            },
          },
        ],
      },
      summary: {
        id: "summary",
        title: "Scouting complete",
        transcript: "Continue or scout again.",
        kind: "scene",
        storyNodeType: "text-options",
        entryEffects: [],
        inputs: {
          version: 1,
          fields: [
            { name: "roll", type: "integer", required: true },
            { name: "passed", type: "boolean", required: true },
            {
              name: "secret",
              type: "string",
              required: false,
              default: "private-input-marker",
            },
          ],
        },
        choices: [next("Finish", "ending"), next("Again", "dice")],
      },
      ending: {
        id: "ending",
        title: "Finished",
        transcript: "The end.",
        kind: "ending",
        storyNodeType: "text",
        entryEffects: [],
        choices: [],
      },
    },
  };
}
