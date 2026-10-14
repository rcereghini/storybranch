import type {
  AvatarId,
  AvatarTint,
  FrameId,
} from "../../../packages/contracts/profile";
import { accents } from "./theme";

// Each preset is a line glyph on a tinted badge; ids live in contracts.
export const avatars: Record<
  AvatarId,
  { label: string; tint: string; glyph: string }
> = {
  lantern: {
    label: "Lantern",
    tint: "#ecc597",
    glyph:
      "M9 4h6M10 4V2.5h4V4M8 7h8l-1-3H9zM8 7v10a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V7M12 10.5c1.2 1.3 1.2 3 0 4.2-1.2-1.2-1.2-2.9 0-4.2zM9 22h6",
  },
  compass: {
    label: "Compass",
    tint: "#a7e9cf",
    glyph:
      "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM15.5 8.5l-2 5-5 2 2-5zM12 3v2M12 19v2M3 12h2M19 12h2",
  },
  key: {
    label: "Key",
    tint: "#c9b1e9",
    glyph:
      "M8 15a4 4 0 1 1 0-8 4 4 0 0 1 0 8zM12 11h9M18 11v3M15.5 11v2.5M8 10v2",
  },
  raven: {
    label: "Raven",
    tint: "#9fb7c9",
    glyph:
      "M4 15c3 0 5-1.5 6-4 .8-2 2.4-3.5 4.6-3.5 1.4 0 2.4.6 3.1 1.5L21 10l-2.8.9c.3 3.8-2.3 7.1-6.7 7.1H8zM8 18l-2 3M11 18l-1 3M15.6 9.6h.01",
  },
  tide: {
    label: "Tide",
    tint: "#86c9e0",
    glyph:
      "M3 9c1.5 0 1.5-1.5 3-1.5S7.5 9 9 9s1.5-1.5 3-1.5S13.5 9 15 9s1.5-1.5 3-1.5S19.5 9 21 9M3 13.5c1.5 0 1.5-1.5 3-1.5s1.5 1.5 3 1.5 1.5-1.5 3-1.5 1.5 1.5 3 1.5 1.5-1.5 3-1.5 1.5 1.5 3 1.5M3 18c1.5 0 1.5-1.5 3-1.5S7.5 18 9 18s1.5-1.5 3-1.5 1.5 1.5 3 1.5 1.5-1.5 3-1.5 1.5 1.5 3 1.5",
  },
  gear: {
    label: "Gear",
    tint: "#d8c27a",
    glyph:
      "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1M12 5.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z",
  },
  storm: {
    label: "Storm",
    tint: "#b6c3f0",
    glyph:
      "M7 14.5a4 4 0 0 1-.4-8A5.5 5.5 0 0 1 17 7.5a3.5 3.5 0 0 1 .5 7M12.5 12l-2.5 4.5h3.5L11 21",
  },
  quill: {
    label: "Quill",
    tint: "#e7a9a0",
    glyph:
      "M5 21c3-6 7-11 15-17-1.5 7-6 11.5-12 13M8 17l-3 4M13 13l-3 .5M16 9.5l-3.2.4",
  },
};

// Frame outlines in the 24-unit badge; the diamond leaves least room, so
// its glyph is drawn smaller.
const shapes: Record<FrameId, { path: string; glyphScale: number }> = {
  circle: {
    path: "M12 .6a11.4 11.4 0 1 1 0 22.8A11.4 11.4 0 0 1 12 .6z",
    glyphScale: 0.6,
  },
  rounded: {
    path: "M6.6.6h10.8a6 6 0 0 1 6 6v10.8a6 6 0 0 1-6 6H6.6a6 6 0 0 1-6-6V6.6a6 6 0 0 1 6-6z",
    glyphScale: 0.62,
  },
  hexagon: {
    path: "M12 .6l9.9 5.7v11.4L12 23.4l-9.9-5.7V6.3z",
    glyphScale: 0.56,
  },
  diamond: { path: "M12 .5L23.5 12 12 23.5.5 12z", glyphScale: 0.46 },
};

export function Avatar({
  id,
  size = 40,
  label,
  tint = "preset",
  frame = "circle",
}: {
  id: AvatarId;
  size?: number;
  label?: string;
  tint?: AvatarTint;
  frame?: FrameId;
}) {
  const avatar = avatars[id];
  const color = tint === "preset" ? avatar.tint : accents[tint].color;
  const shape = shapes[frame];
  const offset = 12 - 12 * shape.glyphScale;
  return (
    <svg
      className="avatar-badge"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path d={shape.path} fill={color} fillOpacity="0.16" />
      <path
        d={shape.path}
        fill="none"
        stroke={color}
        strokeOpacity="0.6"
        strokeWidth="0.6"
      />
      <g
        transform={`translate(${offset} ${offset}) scale(${shape.glyphScale})`}
      >
        <path
          d={avatar.glyph}
          fill="none"
          stroke={color}
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}
