import { useState } from "react";

// One series of whole-number daily totals as bars, shared by the admin Usage
// and Analytics tabs. Each day's column is its hover and focus target, and a
// fixed-height readout line shows its numbers, so nothing moves on hover.
export const dayLabel = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
// A clean axis top: 2, 5 or 10 times a power of ten, so the midline is a
// whole number.
function niceMax(value: number) {
  const target = Math.max(value, 2);
  const power = 10 ** Math.floor(Math.log10(target));
  return ([1, 2, 5, 10].find((step) => step * power >= target) ?? 10) * power;
}

export function DailyBars({
  caption,
  points,
}: {
  caption: string;
  // value draws the bar; detail is the readout and the accessible label.
  points: Array<{ day: string; value: number; detail: string }>;
}) {
  const [focused, setFocused] = useState<number | null>(null);
  const top = niceMax(Math.max(0, ...points.map((p) => p.value)));
  const shown = focused !== null ? points[focused] : null;
  if (!points.length) return null;
  return (
    <figure className="admin-chart">
      <figcaption>
        <span>{caption}</span>
        <span className="admin-readout" aria-live="polite">
          {shown
            ? `${dayLabel(shown.day)}: ${shown.detail}`
            : "Hover or focus a day for its numbers"}
        </span>
      </figcaption>
      <div className="admin-plot">
        <div className="admin-axis" aria-hidden="true">
          <span>{top}</span>
          <span>{top / 2}</span>
          <span>0</span>
        </div>
        <div className="admin-bars">
          {points.map((point, i) => (
            <button
              key={point.day}
              className={`admin-bar${focused === i ? " admin-bar-on" : ""}`}
              aria-label={`${dayLabel(point.day)}: ${point.detail}`}
              onPointerEnter={() => setFocused(i)}
              onFocus={() => setFocused(i)}
              onPointerLeave={() => setFocused(null)}
              onBlur={() => setFocused(null)}
            >
              <span style={{ height: `${(point.value / top) * 100}%` }} />
            </button>
          ))}
        </div>
      </div>
      <div className="admin-dates" aria-hidden="true">
        <span>{dayLabel(points[0].day)}</span>
        <span>{dayLabel(points.at(-1)!.day)}</span>
      </div>
    </figure>
  );
}
