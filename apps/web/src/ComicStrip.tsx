import type { CSSProperties } from "react";
import type { Comic } from "../../../packages/contracts/index";
import "./comic.css";

// Comic panels: a square grid (2×2 or 3×3) or a strip read top to bottom.
// Captions are text over the art, so they stay editable and readable by
// screen readers. Studio passes onPanel to make panels selectable.
export function ComicStrip({
  comic,
  images,
  selected,
  onPanel,
}: {
  comic: Comic;
  images: Array<string | undefined>;
  selected?: string;
  onPanel?: (panelId: string) => void;
}) {
  const columns = comic.panels.length > 4 ? 3 : 2;
  return (
    <ol
      className={`comic comic-${comic.layout}`}
      style={{ "--comic-columns": columns } as CSSProperties}
      aria-label="Comic panels"
    >
      {comic.panels.map((panel, i) => {
        const art = images[i] ? (
          <img src={images[i]} alt={panel.alt || `Panel ${i + 1}`} />
        ) : (
          <span className="comic-empty">Panel {i + 1}</span>
        );
        return (
          <li
            key={panel.id}
            className="comic-panel"
            aria-current={selected === panel.id || undefined}
          >
            {onPanel ? (
              <button
                type="button"
                aria-label={`Edit panel ${i + 1}`}
                onClick={() => onPanel(panel.id)}
              >
                {art}
              </button>
            ) : (
              art
            )}
            {panel.caption && <p className="comic-caption">{panel.caption}</p>}
          </li>
        );
      })}
    </ol>
  );
}
