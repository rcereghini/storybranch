// Shared by StoryCover and the link-preview image script so a story's
// generated cover looks the same in the app and when shared.
export const coverArt: Record<string, string> = {
  "glass-harbor": "/media/harbor.svg",
  "bell-diver": "/media/bell-diver-arrival-mock-v1-landscape.svg",
  "paper-moon": "/media/paper-moon-arrival-mock-v1-landscape.svg",
};
const palettes = [
  ["#1d3b3f", "#0f1c22", "#a7e9cf"],
  ["#2d2340", "#121019", "#c9b1e9"],
  ["#3d2e1c", "#16110c", "#ecc597"],
  ["#1c2d45", "#0d131d", "#9fd3f5"],
  ["#3a1f2a", "#170d12", "#f2a7b8"],
  ["#26351c", "#10160c", "#cfe89a"],
];
const hash = (text: string) =>
  [...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
export const coverPalette = (storyId: string) => {
  const [top, bottom, ink] = palettes[hash(storyId) % palettes.length];
  return { top, bottom, ink };
};
export const monogram = (title: string) =>
  title
    .replace(/^the\s+/i, "")
    .trim()
    .charAt(0)
    .toUpperCase() || "◆";
