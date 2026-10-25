import {
  storySchema,
  type Story,
  type Choice,
  GameError,
} from "../contracts/index";
import { routesOf, validateStory } from "./index";

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
  const diagnostics: StoryDiagnostic[] = [];
  try {
    const draft = storySchema.parse(input);
    const safe = new Set<string>();
    const nodes = Object.values(draft.storyNodes);
    const routesSafe = (c: Choice) =>
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
        for (const c of clone.choices)
          for (const r of routesOf(c)) r.targetStoryNodeId = leafId;
        validateStory({
          ...draft,
          entryStoryNodeId: n.id,
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
        if (n.choices.some((c) => guaranteed(c) && routesSafe(c))) {
          safe.add(n.id);
          changed = true;
        }
      }
    }
    const effective: Story = { ...draft, storyNodes: {} };
    for (const n of nodes) {
      if (!safe.has(n.id)) {
        diagnostics.push({
          storyNodeId: n.id,
          message:
            invalid.get(n.id) ??
            "No guaranteed path to a StoryLeaf. Add an unconditional, cost-free exit; every required outcome must be safe.",
        });
        continue;
      }
      const choices = n.choices.filter((c) => {
        const allowed =
          routesSafe(c) &&
          (c.outcome.kind !== "reveal" ||
            c.outcome.results.every(
              (r) =>
                draft.storyNodes[r.route.targetStoryNodeId]?.kind === "ending",
            ));
        if (!allowed)
          diagnostics.push({
            storyNodeId: n.id,
            choiceId: c.id,
            message: `“${c.label}” is hidden: a required destination is missing or unsafe.`,
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
