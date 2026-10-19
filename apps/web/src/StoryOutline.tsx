import type { Story, StoryPage } from "../../../packages/contracts/index";
import { connections } from "../../../packages/domain/story-graph";

export const pageTypeNames: Record<StoryPage["pageType"], string> = {
  text: "Text",
  "text-options": "Text · options",
  video: "Video",
  "video-options": "Video · options",
  dice: "Dice roll",
  reveal: "Quiz result",
};

// Pages in reading order: breadth-first from the first page, then any page
// nothing leads to yet.
export function outlineOrder(story: Story) {
  const order: string[] = [];
  const queue = [story.entryPageId];
  while (queue.length) {
    const id = queue.shift()!;
    if (order.includes(id) || !story.pages[id]) continue;
    order.push(id);
    for (const edge of connections(story.pages[id])) queue.push(edge.target);
  }
  const loose = Object.keys(story.pages).filter((id) => !order.includes(id));
  return { order, loose };
}

// The story as a list: what each page is and where its choices lead. On a
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
    const page = story.pages[id];
    const edges = connections(page).filter((e) => story.pages[e.target]);
    return (
      <li key={id}>
        <button
          className="outline-page"
          aria-current={selected === id ? "true" : undefined}
          onClick={() => onSelect(id)}
        >
          <span className="outline-kind">
            {id === story.entryPageId
              ? "Start · "
              : page.kind === "ending"
                ? "Ending · "
                : ""}
            {pageTypeNames[page.pageType]}
          </span>
          <strong>{page.title || "Untitled page"}</strong>
          {page.kind === "ending" ? (
            <small>Story closes</small>
          ) : edges.length ? (
            <small>
              {edges
                .map(
                  (e) =>
                    `${edges.length > 1 ? `${e.label} → ` : "→ "}${story.pages[e.target].title}`,
                )
                .join(" · ")}
            </small>
          ) : (
            <small className="outline-warning">No next page yet</small>
          )}
        </button>
      </li>
    );
  };
  return (
    <nav className="story-outline" aria-label="Story pages">
      <ol>{order.map(row)}</ol>
      {loose.length > 0 && (
        <>
          <h3>Not reachable yet</h3>
          <p>Connect a choice to these pages so players can reach them.</p>
          <ol>{loose.map(row)}</ol>
        </>
      )}
    </nav>
  );
}
