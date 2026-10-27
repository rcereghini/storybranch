import type { StagedBattleStory as Story } from "../../../packages/contracts/battle-graph";
type StoryNode = Story["storyNodes"][string];
import { connections } from "../../../packages/domain/story-graph";

export const storyNodeTypeNames: Record<StoryNode["storyNodeType"], string> = {
  text: "Text",
  "text-options": "Text · options",
  video: "Video",
  "video-options": "Video · options",
  dice: "Dice roll",
  reveal: "Quiz result",
  comic: "Comic",
  battle: "Battle",
};

// StoryNodes in reading order: breadth-first from the first StoryNode, then any StoryNode
// nothing leads to yet.
export function outlineOrder(story: Story) {
  const order: string[] = [];
  const queue = [story.entryStoryNodeId];
  while (queue.length) {
    const id = queue.shift()!;
    if (order.includes(id) || !story.storyNodes[id]) continue;
    order.push(id);
    for (const edge of connections(story.storyNodes[id]))
      queue.push(edge.target);
  }
  const loose = Object.keys(story.storyNodes).filter(
    (id) => !order.includes(id),
  );
  return { order, loose };
}

// The story as a list: what each StoryNode is and where its choices lead. On a
// phone this is the main way to move around the story.
export function StoryOutline({
  story,
  selected,
  onSelect,
}: {
  story: Story;
  selected: string;
  onSelect: (id: string) => void;
}) {
  const { order, loose } = outlineOrder(story);
  const row = (id: string) => {
    const storyNode = story.storyNodes[id];
    const edges = connections(storyNode).filter(
      (e) => story.storyNodes[e.target],
    );
    return (
      <li key={id}>
        <button
          className="outline-story-node"
          aria-current={selected === id ? "true" : undefined}
          onClick={() => onSelect(id)}
        >
          <span className="outline-kind">
            {id === story.entryStoryNodeId
              ? "Start · "
              : storyNode.kind === "ending"
                ? "Ending · "
                : ""}
            {storyNodeTypeNames[storyNode.storyNodeType]}
          </span>
          <strong>{storyNode.title || "Untitled StoryNode"}</strong>
          {storyNode.kind === "ending" ? (
            <small>Story closes</small>
          ) : edges.length ? (
            <small>
              {edges
                .map(
                  (e) =>
                    `${edges.length > 1 ? `${e.label} → ` : "→ "}${story.storyNodes[e.target].title}`,
                )
                .join(" · ")}
            </small>
          ) : (
            <small className="outline-warning">No next StoryNode yet</small>
          )}
        </button>
      </li>
    );
  };
  return (
    <nav className="story-outline" aria-label="Story StoryNodes">
      <ol>{order.map(row)}</ol>
      {loose.length > 0 && (
        <>
          <h3>Not reachable yet</h3>
          <p>Connect a choice to these StoryNodes so players can reach them.</p>
          <ol>{loose.map(row)}</ol>
        </>
      )}
    </nav>
  );
}
