import { useRef, useState } from "react";
import type { Story, StoryPage } from "../../../packages/contracts/index";
import type { PagePositions } from "../../../packages/contracts/authoring";
import {
  arrangePages,
  connections,
  graphCardHeight,
  type PageConnection,
} from "../../../packages/domain/story-graph";
import { Button } from "./ui";
import "./story-graph.css";
const names: Record<StoryPage["pageType"], string> = {
  text: "Text",
  "text-options": "Text · options",
  video: "Video",
  "video-options": "Video · options",
  dice: "Dice roll",
  reveal: "Quiz result",
};
export function StoryGraph({
  story,
  positions,
  selected,
  disabled,
  onSelect,
  onMove,
  onConnect,
  onAdd,
  onBranch,
}: {
  story: Story;
  positions?: PagePositions;
  selected: string;
  disabled: boolean;
  onSelect: (id: string) => void;
  onMove: (positions: PagePositions) => void;
  onConnect: (source: string, edge: PageConnection, target: string) => void;
  onAdd: (
    type: "text" | "text-options" | "video" | "video-options" | "ending",
  ) => void;
  onBranch: () => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [kind, setKind] = useState<
    "text" | "text-options" | "video" | "video-options" | "ending"
  >("text");
  const [link, setLink] = useState<{
    source: string;
    edge: PageConnection;
  } | null>(null);
  const [moving, setMoving] = useState<PagePositions>({});
  const drag = useRef<{
    id: string;
    startX: number;
    startY: number;
    x: number;
    y: number;
  } | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const points = { ...arrangePages(story), ...positions, ...moving };
  const pages = Object.values(story.pages);
  const width = Math.max(1000, ...pages.map((p) => points[p.id].x + 340));
  const height = Math.max(
    560,
    ...pages.map((p) => points[p.id].y + graphCardHeight(p) + 60),
  );
  const clean = () =>
    Object.fromEntries(pages.map((p) => [p.id, points[p.id]]));
  const choose = (id: string) => {
    if (disabled) return;
    if (link) {
      onConnect(link.source, link.edge, id);
      setLink(null);
    } else onSelect(id);
  };
  const branchable =
    story.pages[selected]?.kind !== "ending" &&
    ["text", "text-options", "video", "video-options"].includes(
      story.pages[selected]?.pageType,
    );
  return (
    <section className="story-graph" aria-label="Branching story timeline">
      <div className="graph-heading">
        <div>
          <p className="eyebrow">Story map</p>
          <h2>Pages and branches</h2>
          <p>
            Drag pages to arrange them. Select an output, then its destination
            to connect a branch.
          </p>
        </div>
        <span className="graph-count">{pages.length} / 80 pages</span>
      </div>
      <div className="graph-toolbar">
        <select
          aria-label="New timeline page type"
          value={kind}
          onChange={(e) => setKind(e.target.value as typeof kind)}
          disabled={disabled}
        >
          <option value="text">Text page</option>
          <option value="text-options">Text with options</option>
          <option value="video">Video page</option>
          <option value="video-options">Video with options</option>
          <option value="ending">Ending</option>
        </select>
        <Button
          disabled={disabled || pages.length >= 80}
          onClick={() => onAdd(kind)}
        >
          + Add page
        </Button>
        <Button
          disabled={
            disabled ||
            !branchable ||
            pages.length >= 80 ||
            story.pages[selected].choices.length >= 20
          }
          onClick={onBranch}
        >
          + Add branch
        </Button>
        <Button
          disabled={disabled}
          onClick={() => {
            onMove(arrangePages(story));
            setMoving({});
          }}
        >
          Arrange tree
        </Button>
        <div className="graph-zoom">
          <Button
            aria-label="Zoom out timeline"
            onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.2).toFixed(1)))}
          >
            −
          </Button>
          <span>{Math.round(zoom * 100)}%</span>
          <Button
            aria-label="Zoom in timeline"
            onClick={() => setZoom((z) => Math.min(1.4, +(z + 0.2).toFixed(1)))}
          >
            +
          </Button>
        </div>
        <Button
          onClick={() =>
            viewport.current?.scrollTo({
              left: Math.max(0, points[selected].x * zoom - 40),
              top: Math.max(0, points[selected].y * zoom - 40),
              behavior: "smooth",
            })
          }
        >
          Find selected
        </Button>
      </div>
      <div className="graph-link-status" role="status">
        {link ? (
          <>
            <span>
              Connect “{link.edge.label}” from {story.pages[link.source]?.title}
              . Select a destination page.
            </span>
            <Button onClick={() => setLink(null)}>Cancel connection</Button>
          </>
        ) : (
          <span>
            Left to right: start → decisions → endings. Moving a page changes
            its position, not its connections.
          </span>
        )}
      </div>
      <div
        className="graph-viewport"
        ref={viewport}
        tabIndex={0}
        aria-label="Scrollable page canvas"
        onKeyDown={(e) => {
          if (e.key === "Escape") setLink(null);
        }}
      >
        <div style={{ width: width * zoom, height: height * zoom }}>
          <div
            className="graph-canvas"
            style={{ width, height, transform: `scale(${zoom})` }}
          >
            <svg
              className="graph-wires"
              width={width}
              height={height}
              aria-hidden="true"
            >
              <defs>
                <marker
                  id="graph-arrow"
                  markerWidth="8"
                  markerHeight="8"
                  refX="7"
                  refY="4"
                  orient="auto"
                >
                  <path d="M0 0L8 4L0 8" fill="currentColor" />
                </marker>
              </defs>
              {pages.flatMap((p) =>
                connections(p).map((edge, i) => {
                  if (!story.pages[edge.target]) return null;
                  const from = points[p.id],
                    to = points[edge.target];
                  const x = from.x + 270,
                    y = from.y + 116 + i * 34 + 17;
                  const tx = to.x,
                    ty = to.y + 58;
                  const bend = tx > x ? Math.max(40, (tx - x) / 2) : 90;
                  return (
                    <path
                      key={`${p.id}-${edge.choiceId}-${edge.slot}`}
                      className={p.id === selected ? "selected" : ""}
                      d={`M ${x} ${y} C ${x + bend} ${y}, ${tx - bend} ${ty}, ${tx} ${ty}`}
                      markerEnd="url(#graph-arrow)"
                    />
                  );
                }),
              )}
            </svg>
            {pages.map((p) => (
              <article
                key={p.id}
                className={`graph-card ${selected === p.id ? "is-selected" : ""} ${link ? "is-target" : ""}`}
                style={{
                  left: points[p.id].x,
                  top: points[p.id].y,
                  width: 270,
                  height: graphCardHeight(p),
                }}
                data-page-id={p.id}
              >
                <button
                  className="graph-drag"
                  disabled={disabled}
                  aria-label={`Move ${p.title}`}
                  title="Drag to move. Arrow keys move 24 pixels."
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    e.currentTarget.setPointerCapture(e.pointerId);
                    drag.current = {
                      id: p.id,
                      startX: e.clientX,
                      startY: e.clientY,
                      ...points[p.id],
                    };
                  }}
                  onPointerMove={(e) => {
                    const d = drag.current;
                    if (!d || d.id !== p.id) return;
                    setMoving({
                      [p.id]: {
                        x: Math.min(
                          49000,
                          Math.max(16, d.x + (e.clientX - d.startX) / zoom),
                        ),
                        y: Math.min(
                          49000,
                          Math.max(16, d.y + (e.clientY - d.startY) / zoom),
                        ),
                      },
                    });
                  }}
                  onPointerUp={() => {
                    if (drag.current) {
                      onMove(clean());
                      drag.current = null;
                      setMoving({});
                    }
                  }}
                  onPointerCancel={() => {
                    drag.current = null;
                    setMoving({});
                  }}
                  onKeyDown={(e) => {
                    const delta: Record<string, [number, number]> = {
                      ArrowLeft: [-24, 0],
                      ArrowRight: [24, 0],
                      ArrowUp: [0, -24],
                      ArrowDown: [0, 24],
                    };
                    if (!delta[e.key]) return;
                    e.preventDefault();
                    const [x, y] = delta[e.key];
                    onMove({
                      ...clean(),
                      [p.id]: {
                        x: Math.max(16, Math.min(49000, points[p.id].x + x)),
                        y: Math.max(16, Math.min(49000, points[p.id].y + y)),
                      },
                    });
                  }}
                >
                  <span>
                    {p.id === story.entryPageId
                      ? "START · "
                      : p.kind === "ending"
                        ? "ENDING · "
                        : ""}
                    {names[p.pageType]}
                  </span>
                  <span aria-hidden="true">⠿</span>
                </button>
                <button
                  className="graph-card-title"
                  disabled={disabled}
                  aria-label={`${link ? "Connect to" : "Edit"} ${p.title}`}
                  aria-pressed={selected === p.id}
                  onClick={() => choose(p.id)}
                >
                  <strong>{p.title || "Untitled page"}</strong>
                  <span>
                    {link
                      ? "Connect here ↙"
                      : p.transcript || "Select to edit this page"}
                  </span>
                </button>
                <div className="graph-outputs">
                  {p.kind === "ending" ? (
                    <p>Story closes · Replay / Discover</p>
                  ) : connections(p).length ? (
                    connections(p).map((edge) => (
                      <button
                        key={`${edge.choiceId}-${edge.slot}`}
                        disabled={disabled}
                        aria-label={`Connect ${edge.label} from ${p.title}`}
                        aria-pressed={
                          link?.source === p.id &&
                          link.edge.choiceId === edge.choiceId &&
                          link.edge.slot === edge.slot
                        }
                        title={`${edge.label} → ${story.pages[edge.target]?.title ?? "Missing page"}`}
                        onClick={() => setLink({ source: p.id, edge })}
                      >
                        <span>{edge.label}</span>
                        <small>
                          {story.pages[edge.target]?.title ?? "Missing page"}
                        </small>
                        <i aria-hidden="true">●</i>
                      </button>
                    ))
                  ) : (
                    <p>Add outputs in page settings</p>
                  )}
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
