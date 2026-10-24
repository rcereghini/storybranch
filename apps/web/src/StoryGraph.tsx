import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Story } from "../../../packages/contracts/index";
import type { StoryNodePositions } from "../../../packages/contracts/authoring";
import {
  arrangeStoryNodes,
  connections,
  graphCardHeight,
  type StoryNodeConnection,
} from "../../../packages/domain/story-graph";
import { Button } from "./ui";
import { storyNodeTypeNames } from "./StoryOutline";
import "./story-graph.css";

const CARD = 270;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 1.6;
type View = { x: number; y: number; z: number };
type NewStoryNode =
  | "text"
  | "text-options"
  | "video"
  | "video-options"
  | "ending";
const clamp = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

// The story map: a canvas you pan by dragging the background (or scrolling a
// trackpad) and zoom with pinch, Ctrl/Cmd + scroll or the zoom buttons.
// Cards move by their handle; positions are in canvas coordinates, so the
// saved layout does not depend on zoom.
export function StoryGraph({
  story,
  positions,
  selected,
  disabled,
  focus,
  onSelect,
  onMove,
  onConnect,
  onAdd,
  onBranch,
}: {
  story: Story;
  positions?: StoryNodePositions;
  selected: string;
  disabled: boolean;
  // Changing this number centers the selected StoryNode.
  focus: number;
  onSelect: (id: string) => void;
  onMove: (positions: StoryNodePositions) => void;
  onConnect: (
    source: string,
    edge: StoryNodeConnection,
    target: string,
  ) => void;
  onAdd: (type: NewStoryNode) => void;
  onBranch: () => void;
}) {
  const [view, setView] = useState<View>({ x: 40, y: 40, z: 1 });
  const [kind, setKind] = useState<NewStoryNode>("text");
  const [link, setLink] = useState<{
    source: string;
    edge: StoryNodeConnection;
  } | null>(null);
  const [moving, setMoving] = useState<StoryNodePositions>({});
  const [panning, setPanning] = useState(false);
  const drag = useRef<{
    id: string;
    startX: number;
    startY: number;
    x: number;
    y: number;
  } | null>(null);
  // Pointers down on the background: one pans, two pinch.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; view: View } | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const fitted = useRef(false);
  const points = { ...arrangeStoryNodes(story), ...positions, ...moving };
  const storyNodes = Object.values(story.storyNodes);
  const bounds = {
    minX: Math.min(...storyNodes.map((p) => points[p.id].x)),
    minY: Math.min(...storyNodes.map((p) => points[p.id].y)),
    maxX: Math.max(...storyNodes.map((p) => points[p.id].x + CARD)),
    maxY: Math.max(
      ...storyNodes.map((p) => points[p.id].y + graphCardHeight(p)),
    ),
  };
  const width = bounds.maxX + 400;
  const height = bounds.maxY + 400;
  const clean = () =>
    Object.fromEntries(storyNodes.map((p) => [p.id, points[p.id]]));
  const size = () => {
    const rect = viewport.current?.getBoundingClientRect();
    return { w: rect?.width ?? 800, h: rect?.height ?? 600 };
  };
  const fit = () => {
    const { w, h } = size();
    const bw = bounds.maxX - bounds.minX + 80;
    const bh = bounds.maxY - bounds.minY + 80;
    const z = clamp(Math.min(w / bw, h / bh, 1));
    setView({
      z,
      x: (w - (bounds.maxX + bounds.minX) * z) / 2,
      y: (h - (bounds.maxY + bounds.minY) * z) / 2,
    });
  };
  const center = (id: string) => {
    const point = points[id];
    if (!point) return;
    const { w, h } = size();
    setView((v) => ({
      ...v,
      x: w / 2 - (point.x + CARD / 2) * v.z,
      y: h / 2 - (point.y + graphCardHeight(story.storyNodes[id]) / 2) * v.z,
    }));
  };
  // Zoom keeping the canvas point under (px, py) in place.
  const zoomAt = (factor: number, px?: number, py?: number) =>
    setView((v) => {
      const { w, h } = size();
      const cx = px ?? w / 2,
        cy = py ?? h / 2;
      const z = clamp(v.z * factor);
      return {
        z,
        x: cx - ((cx - v.x) * z) / v.z,
        y: cy - ((cy - v.y) * z) / v.z,
      };
    });
  // First view: the whole story if it fits at a readable size, otherwise
  // readable cards starting from the first StoryNode.
  const open = () => {
    const { w, h } = size();
    const bw = bounds.maxX - bounds.minX + 80;
    const bh = bounds.maxY - bounds.minY + 80;
    const z = clamp(Math.min(w / bw, h / bh, 1));
    if (z >= 0.75) return fit();
    const readable = w < 600 ? 0.7 : 0.85;
    const entry = points[story.entryStoryNodeId] ?? {
      x: bounds.minX,
      y: bounds.minY,
    };
    setView({
      z: readable,
      x: 32 - entry.x * readable,
      y: h / 2 - (entry.y + 90) * readable,
    });
  };
  useLayoutEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (!fitted.current && el.clientWidth > 0) {
        fitted.current = true;
        open();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (focus) center(selected);
  }, [focus]);
  // Wheel needs a non-passive listener to keep the StoryNode from scrolling.
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey)
        zoomAt(
          Math.exp(-e.deltaY * 0.01),
          e.clientX - rect.left,
          e.clientY - rect.top,
        );
      else
        setView((v) => ({
          ...v,
          x: v.x - (e.shiftKey ? e.deltaY : e.deltaX),
          y: v.y - (e.shiftKey ? 0 : e.deltaY),
        }));
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);

  const choose = (id: string) => {
    if (disabled) return;
    if (link) {
      onConnect(link.source, link.edge, id);
      setLink(null);
    } else onSelect(id);
  };
  const branchable =
    story.storyNodes[selected]?.kind !== "ending" &&
    ["text", "text-options", "video", "video-options"].includes(
      story.storyNodes[selected]?.storyNodeType,
    );
  const background = (target: EventTarget) =>
    !(target as Element).closest(".graph-card, .graph-floating");

  // Overview map: every card plus the visible area; click to jump there.
  const { w: vw, h: vh } = viewport.current ? size() : { w: 800, h: 600 };
  const area = {
    x: -view.x / view.z,
    y: -view.y / view.z,
    w: vw / view.z,
    h: vh / view.z,
  };
  const mapBox = {
    x: Math.min(bounds.minX, area.x) - 40,
    y: Math.min(bounds.minY, area.y) - 40,
    w:
      Math.max(bounds.maxX, area.x + area.w) -
      Math.min(bounds.minX, area.x) +
      80,
    h:
      Math.max(bounds.maxY, area.y + area.h) -
      Math.min(bounds.minY, area.y) +
      80,
  };
  const jump = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const scale = Math.max(mapBox.w / rect.width, mapBox.h / rect.height);
    // The viewBox is centered when its aspect differs from the element's.
    const ox = (rect.width * scale - mapBox.w) / 2;
    const oy = (rect.height * scale - mapBox.h) / 2;
    const wx = mapBox.x - ox + (e.clientX - rect.left) * scale;
    const wy = mapBox.y - oy + (e.clientY - rect.top) * scale;
    setView((v) => ({ ...v, x: vw / 2 - wx * v.z, y: vh / 2 - wy * v.z }));
  };

  return (
    <section className="story-graph" aria-label="Branching story timeline">
      <div
        className={`graph-viewport ${panning ? "is-panning" : ""}`}
        ref={viewport}
        tabIndex={0}
        aria-label="Story map. Drag to pan, pinch or Ctrl and scroll to zoom."
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          const step: Record<string, [number, number]> = {
            ArrowLeft: [60, 0],
            ArrowRight: [-60, 0],
            ArrowUp: [0, 60],
            ArrowDown: [0, -60],
          };
          if (e.key === "Escape") setLink(null);
          else if (step[e.key]) {
            e.preventDefault();
            const [dx, dy] = step[e.key];
            setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
          } else if (e.key === "+" || e.key === "=") zoomAt(1.2);
          else if (e.key === "-") zoomAt(1 / 1.2);
          else if (e.key === "0") fit();
        }}
        onPointerDown={(e) => {
          if (!background(e.target)) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (pointers.current.size === 2) {
            const [a, b] = [...pointers.current.values()];
            pinch.current = {
              distance: Math.hypot(a.x - b.x, a.y - b.y),
              view,
            };
          }
          setPanning(true);
        }}
        onPointerMove={(e) => {
          const last = pointers.current.get(e.pointerId);
          if (!last) return;
          const next = { x: e.clientX, y: e.clientY };
          pointers.current.set(e.pointerId, next);
          if (pointers.current.size === 2 && pinch.current) {
            const [a, b] = [...pointers.current.values()];
            const rect = e.currentTarget.getBoundingClientRect();
            const start = pinch.current.view;
            const z = clamp(
              (start.z * Math.hypot(a.x - b.x, a.y - b.y)) /
                pinch.current.distance,
            );
            const cx = (a.x + b.x) / 2 - rect.left,
              cy = (a.y + b.y) / 2 - rect.top;
            setView((v) => ({
              z,
              x: cx - ((cx - v.x) * z) / v.z,
              y: cy - ((cy - v.y) * z) / v.z,
            }));
          } else if (pointers.current.size === 1)
            setView((v) => ({
              ...v,
              x: v.x + next.x - last.x,
              y: v.y + next.y - last.y,
            }));
        }}
        onPointerUp={(e) => {
          pointers.current.delete(e.pointerId);
          if (pointers.current.size < 2) pinch.current = null;
          if (!pointers.current.size) setPanning(false);
        }}
        onPointerCancel={(e) => {
          pointers.current.delete(e.pointerId);
          pinch.current = null;
          if (!pointers.current.size) setPanning(false);
        }}
      >
        <div
          className="graph-canvas"
          style={{
            width,
            height,
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})`,
          }}
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
            {storyNodes.flatMap((p) =>
              connections(p).map((edge, i) => {
                if (!story.storyNodes[edge.target]) return null;
                const from = points[p.id],
                  to = points[edge.target];
                const x = from.x + CARD,
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
          {storyNodes.map((p) => (
            <article
              key={p.id}
              className={`graph-card ${selected === p.id ? "is-selected" : ""} ${link ? "is-target" : ""} ${p.kind === "ending" ? "is-ending" : ""}`}
              style={{
                left: points[p.id].x,
                top: points[p.id].y,
                width: CARD,
                height: graphCardHeight(p),
              }}
              data-story-node-id={p.id}
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
                  // Whole pixels, whatever the zoom.
                  setMoving({
                    [p.id]: {
                      x: Math.round(
                        Math.min(
                          49000,
                          Math.max(16, d.x + (e.clientX - d.startX) / view.z),
                        ),
                      ),
                      y: Math.round(
                        Math.min(
                          49000,
                          Math.max(16, d.y + (e.clientY - d.startY) / view.z),
                        ),
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
                  {p.id === story.entryStoryNodeId
                    ? "Start · "
                    : p.kind === "ending"
                      ? "Ending · "
                      : ""}
                  {storyNodeTypeNames[p.storyNodeType]}
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
                <strong>{p.title || "Untitled StoryNode"}</strong>
                <span>
                  {link
                    ? "Connect here ↙"
                    : p.transcript || "Select to edit this StoryNode"}
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
                      title={`${edge.label} → ${story.storyNodes[edge.target]?.title ?? "Missing StoryNode"}`}
                      onClick={() => setLink({ source: p.id, edge })}
                    >
                      <span>{edge.label}</span>
                      <small>
                        {story.storyNodes[edge.target]?.title ??
                          "Missing StoryNode"}
                      </small>
                      <i aria-hidden="true">●</i>
                    </button>
                  ))
                ) : (
                  <p>Add outputs in StoryNode settings</p>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>

      <div
        className="graph-floating graph-toolbar"
        role="toolbar"
        aria-label="Story map tools"
      >
        <div className="graph-add">
          <select
            aria-label="New timeline StoryNode type"
            value={kind}
            onChange={(e) => setKind(e.target.value as NewStoryNode)}
            disabled={disabled}
          >
            <option value="text">Text StoryNode</option>
            <option value="text-options">Text with options</option>
            <option value="video">Video StoryNode</option>
            <option value="video-options">Video with options</option>
            <option value="ending">Ending</option>
          </select>
          <Button
            disabled={disabled || storyNodes.length >= 80}
            onClick={() => onAdd(kind)}
          >
            + Add StoryNode
          </Button>
        </div>
        <Button
          disabled={
            disabled ||
            !branchable ||
            storyNodes.length >= 80 ||
            story.storyNodes[selected].choices.length >= 20
          }
          onClick={onBranch}
        >
          + Add branch
        </Button>
        <Button
          disabled={disabled}
          onClick={() => {
            onMove(arrangeStoryNodes(story));
            setMoving({});
          }}
        >
          Arrange tree
        </Button>
        <span className="graph-count">{storyNodes.length} / 80 StoryNodes</span>
      </div>

      <div className="graph-floating graph-zoom" role="group" aria-label="Zoom">
        <Button aria-label="Zoom out timeline" onClick={() => zoomAt(1 / 1.25)}>
          −
        </Button>
        <span aria-live="polite">{Math.round(view.z * 100)}%</span>
        <Button aria-label="Zoom in timeline" onClick={() => zoomAt(1.25)}>
          +
        </Button>
        <Button onClick={fit}>Fit</Button>
        <Button aria-label="Find selected" onClick={() => center(selected)}>
          ◎
        </Button>
      </div>

      <svg
        className="graph-floating graph-minimap"
        viewBox={`${mapBox.x} ${mapBox.y} ${mapBox.w} ${mapBox.h}`}
        role="img"
        aria-label="Overview. Click to move there."
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          jump(e);
        }}
        onPointerMove={(e) => {
          if (e.buttons) jump(e);
        }}
      >
        {storyNodes.map((p) => (
          <rect
            key={p.id}
            className={p.id === selected ? "selected" : ""}
            x={points[p.id].x}
            y={points[p.id].y}
            width={CARD}
            height={graphCardHeight(p)}
            rx={14}
          />
        ))}
        <rect
          className="graph-minimap-view"
          x={area.x}
          y={area.y}
          width={area.w}
          height={area.h}
        />
      </svg>

      {/* Floats over the canvas, so status changes never move the map. */}
      <div className="graph-floating graph-link-status" role="status">
        {link ? (
          <>
            <span>
              Connect “{link.edge.label}” from{" "}
              {story.storyNodes[link.source]?.title}. Select a destination
              StoryNode.
            </span>
            <Button onClick={() => setLink(null)}>Cancel connection</Button>
          </>
        ) : (
          <span>
            Drag the background to move around. Select an output, then a
            StoryNode, to connect them.
          </span>
        )}
      </div>
    </section>
  );
}
