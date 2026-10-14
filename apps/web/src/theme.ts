import type {
  AccentId,
  BannerId,
  FrameId,
} from "../../../packages/contracts/profile";

// Accent swatches; each passes contrast against the dark surfaces and works
// as a button fill under the dark --on-accent text color.
export const accents: Record<AccentId, { label: string; color: string }> = {
  teal: { label: "Teal", color: "#a7e9cf" },
  violet: { label: "Violet", color: "#c9b1e9" },
  amber: { label: "Amber", color: "#ecc597" },
  rose: { label: "Rose", color: "#f2a7b8" },
  sky: { label: "Sky", color: "#9fd3f5" },
  lime: { label: "Lime", color: "#cfe89a" },
};
export const banners: Record<BannerId, string> = {
  harbor: "Harbor fog",
  clockwork: "Clockwork brass",
  storm: "Storm front",
  aurora: "Aurora",
  ember: "Ember",
  grove: "Deep grove",
};
export const frames: Record<FrameId, string> = {
  circle: "Circle",
  rounded: "Rounded",
  hexagon: "Hexagon",
  diamond: "Diamond",
};
