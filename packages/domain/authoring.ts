import { type Story, GameError } from "../contracts/index";
import { routesOf, validateStory } from "./index";

// Structural graph safety is shared by authoring clients and publication.
export function validatePublication(input: unknown): Story {
  try {
    const story = validateStory(input);
    if (!story.title.trim()) throw new Error("Give the story a title.");
    const reached = new Set<string>();
    const destinations = (storyNodeId: string) =>
      story.storyNodes[storyNodeId].choices.flatMap((c) =>
        routesOf(c).map((r) => r.targetStoryNodeId),
      );
    const visit = (storyNodeId: string) => {
      if (reached.has(storyNodeId)) return;
      reached.add(storyNodeId);
      destinations(storyNodeId).forEach(visit);
    };
    visit(story.entryStoryNodeId);
    const unreachable = Object.keys(story.storyNodes).filter(
      (id) => !reached.has(id),
    );
    if (unreachable.length)
      throw new Error(
        `Connect or remove unreachable StoryNodes: ${unreachable.join(", ")}`,
      );
    const exits = new Set(
      Object.values(story.storyNodes)
        .filter((p) => p.kind === "ending")
        .map((p) => p.id),
    );
    let changed = true;
    while (changed) {
      changed = false;
      for (const id of reached)
        if (
          !exits.has(id) &&
          destinations(id).some((next) => exits.has(next))
        ) {
          exits.add(id);
          changed = true;
        }
    }
    const trapped = [...reached].filter((id) => !exits.has(id));
    if (trapped.length)
      throw new Error(`Add a route to an ending from: ${trapped.join(", ")}`);
    return story;
  } catch (error) {
    throw new GameError(
      "VALIDATION_FAILED",
      error instanceof Error ? error.message : "Invalid story.",
    );
  }
}
