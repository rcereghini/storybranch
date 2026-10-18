// Shared by StoryCover and the link-preview image script so a story's
// generated cover looks the same in the app and when shared.
export const coverArt: Record<string, string> = {
  "glass-harbor": "/media/harbor.svg",
  "bell-diver": "/media/bell-diver-arrival-mock-v1-landscape.svg",
  "paper-moon": "/media/paper-moon-arrival-mock-v1-landscape.svg",
};
// [top, bottom, ink]: deep enough that the light ink title reads on both
// themes' cards.
const palettes = [
  ["#2e7a8a", "#142540", "#e6f7fa"],
  ["#5550d2", "#20185a", "#eeedff"],
  ["#b9752e", "#3e2211", "#fff4e6"],
  ["#3a8f68", "#283866", "#eafbf2"],
  ["#c2566b", "#3b1530", "#ffe9ee"],
  ["#6b7a2e", "#1f2a12", "#f4f8e4"],
];
// FNV-1a: spreads similar ids across the palettes.
const hash = (text: string) =>
  [...text].reduce(
    (h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0,
    2166136261,
  );
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
