// Shipped artwork for known stories; anything else gets a generated cover so
// creator stories never show an empty tile.
const art: Record<string, string> = {
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

export function StoryCover({
  storyId,
  title,
  className = "",
}: {
  storyId: string;
  title: string;
  className?: string;
}) {
  const src = art[storyId];
  if (src)
    return (
      <div className={`story-cover ${className}`}>
        <img src={src} alt="" loading="lazy" />
      </div>
    );
  const [top, bottom, ink] = palettes[hash(storyId) % palettes.length];
  const monogram = title
    .replace(/^the\s+/i, "")
    .trim()
    .charAt(0)
    .toUpperCase();
  return (
    <div
      className={`story-cover generated ${className}`}
      style={{
        background: `radial-gradient(circle at 78% 18%, ${ink}33, transparent 45%), linear-gradient(160deg, ${top}, ${bottom})`,
        color: ink,
      }}
      aria-hidden="true"
    >
      <span>{monogram || "◆"}</span>
    </div>
  );
}
