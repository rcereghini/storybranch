import {
  storySchema,
  type Story,
  type Choice,
  GameError,
} from "../contracts/index";
import { routesOf, validateStory } from "./index";
import { choiceInputIssue } from "./branch-data";

export type StoryDiagnostic = {
  storyNodeId?: string;
  choiceId?: string;
  message: string;
};
export type PublicationReview = {
  story?: Story;
  diagnostics: StoryDiagnostic[];
  error?: string;
};

// Conservative proof: a cost-free, unconditional strategy reaches a leaf.
// All server-selected outcomes must be safe; random results are never filtered.
export function reviewPublication(input: unknown): PublicationReview {
  return reviewGraph(input);
}

// Internal compiler extension; live publication never accepts caller-provided rules.
export function reviewGraph(
  input: unknown,
  rules?: {
    allChoicesRequired: ReadonlySet<string>;
    choiceIssue: (sourceId: string, choice: Choice) => string | undefined;
    entryIssue: () => string | undefined;
  },
): PublicationReview {
  const diagnostics: StoryDiagnostic[] = [];
  try {
    const draft = storySchema.parse(input);
    const entryIssue = rules?.entryIssue();
    if (entryIssue) throw new Error(entryIssue);
    const safe = new Set<string>();
    const nodes = Object.values(draft.storyNodes);
    const routesSafe = (c: Choice, sourceId: string) =>
      !rules?.choiceIssue(sourceId, c) &&
      !choiceInputIssue(c, draft.storyNodes) &&
      routesOf(c).every((r) => safe.has(r.targetStoryNodeId)) &&
      (c.outcome.kind !== "reveal" ||
        c.outcome.results.every(
          (r) => draft.storyNodes[r.route.targetStoryNodeId]?.kind === "ending",
        ));
    const guaranteed = (c: Choice) =>
      !c.availableWhen &&
      c.costs.length === 0 &&
      routesOf(c).every((r) =>
        r.effects.every((e) => e.kind !== "item" || e.delta === 0),
      );
    // Validate local shapes independently of incomplete wiring. Substitute a
    // temporary leaf for this check only; never reroute the authored graph.
    const invalid = new Map<string, string>();
    for (const [key, n] of Object.entries(draft.storyNodes)) {
      try {
        if (key !== n.id) throw new Error("Mismatched StoryNode ID");
        let leafId = "validation-leaf";
        while (draft.storyNodes[leafId]) leafId += "-x";
        const clone = structuredClone(n);
        // The synthetic local check cannot resolve real destination inputs.
        // Original bindings are checked per edge before admitting safe routes.
        if (clone.inputs)
          clone.inputs.fields = clone.inputs.fields.map((f) => ({
            ...f,
            required: false,
          }));
        for (const c of clone.choices)
          for (const r of routesOf(c)) {
            r.targetStoryNodeId = leafId;
            delete r.inputBindings;
          }
        validateStory({
          ...draft,
          entryStoryNodeId: n.id,
          // Isolated node validation cannot resolve references to other real leaves.
          // The final effective graph below validates the original bindings.
          ...(draft.progression
            ? {
                progression: {
                  ...draft.progression,
                  keys: draft.progression.keys.map((k) =>
                    k.achievementStoryNodeId
                      ? { ...k, achievementStoryNodeId: leafId }
                      : k,
                  ),
                },
              }
            : {}),
          storyNodes: {
            [n.id]: clone,
            [leafId]: {
              id: leafId,
              title: "Validation",
              transcript: "",
              kind: "ending",
              storyNodeType: "text",
              entryEffects: [],
              choices: [],
            },
          },
        });
        if (n.entryEffects.some((e) => e.kind === "item" && e.delta !== 0))
          throw new Error(
            "Item entry effects need bounded inventory analysis before this path can be published.",
          );
      } catch (e) {
        invalid.set(n.id, (e as Error).message);
      }
    }
    for (const n of nodes)
      if (n.kind === "ending" && !invalid.has(n.id)) safe.add(n.id);
    let changed = true;
    while (changed) {
      changed = false;
      for (const n of nodes) {
        if (safe.has(n.id) || invalid.has(n.id)) continue;
        const safeChoice = (c: Choice) => guaranteed(c) && routesSafe(c, n.id);
        if (
          rules?.allChoicesRequired.has(n.id)
            ? n.choices.length > 0 && n.choices.every(safeChoice)
            : n.choices.some(safeChoice)
        ) {
          safe.add(n.id);
          changed = true;
        }
      }
    }
    const effective: Story = { ...draft, storyNodes: {} };
    for (const n of nodes) {
      if (!safe.has(n.id)) {
        const failedRequired = rules?.allChoicesRequired.has(n.id)
          ? n.choices.find((c) => !guaranteed(c) || !routesSafe(c, n.id))
          : undefined;
        diagnostics.push({
          storyNodeId: n.id,
          message:
            invalid.get(n.id) ??
            (failedRequired
              ? `Required output ${failedRequired.id} is unsafe: ${rules?.choiceIssue(n.id, failedRequired) ?? choiceInputIssue(failedRequired, draft.storyNodes) ?? "destination or route has no guaranteed continuation."}`
              : undefined) ??
            "No guaranteed path to a StoryLeaf. Add an unconditional, cost-free exit; every required outcome must be safe.",
        });
        continue;
      }
      const choices = n.choices.filter((c) => {
        const allowed =
          routesSafe(c, n.id) &&
          (c.outcome.kind !== "reveal" ||
            c.outcome.results.every(
              (r) =>
                draft.storyNodes[r.route.targetStoryNodeId]?.kind === "ending",
            ));
        if (!allowed)
          diagnostics.push({
            storyNodeId: n.id,
            choiceId: c.id,
            message: `“${c.label}” is hidden: ${rules?.choiceIssue(n.id, c) ?? choiceInputIssue(c, draft.storyNodes) ?? "a required destination is missing or unsafe."}`,
          });
        return allowed;
      });
      effective.storyNodes[n.id] = { ...n, choices };
    }
    if (!safe.has(draft.entryStoryNodeId))
      throw new Error(
        invalid.get(draft.entryStoryNodeId) ??
          "Connect the StoryTrunk to a safe starting StoryNode or StoryLeaf before previewing or publishing.",
      );
    const reached = new Set<string>();
    const visit = (id: string) => {
      if (reached.has(id)) return;
      reached.add(id);
      effective.storyNodes[id].choices
        .flatMap(routesOf)
        .forEach((r) => visit(r.targetStoryNodeId));
    };
    visit(draft.entryStoryNodeId);
    for (const id of Object.keys(effective.storyNodes))
      if (!reached.has(id)) {
        delete effective.storyNodes[id];
        diagnostics.push({
          storyNodeId: id,
          message: "Not connected to the StoryTrunk; kept in the draft only.",
        });
      }
    const story = validateStory(effective);
    if (!story.title.trim()) throw new Error("Give the story a title.");
    return { story, diagnostics };
  } catch (error) {
    return {
      diagnostics,
      error: error instanceof Error ? error.message : "Invalid story.",
    };
  }
}

export function validatePublication(input: unknown): Story {
  const review = reviewPublication(input);
  if (!review.story) throw new GameError("VALIDATION_FAILED", review.error!);
  return review.story;
}
