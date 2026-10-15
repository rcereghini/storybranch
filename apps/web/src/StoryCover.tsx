import { coverArt, coverPalette, monogram } from "./cover-palette";

// Shipped artwork for known stories; anything else gets a generated cover so
// creator stories never show an empty tile.
export function StoryCover({
  storyId,
  title,
  className = "",
}: {
  storyId: string;
  title: string;
  className?: string;
}) {
  const src = coverArt[storyId];
  if (src)
    return (
      <div className={`story-cover ${className}`}>
        <img src={src} alt="" loading="lazy" />
      </div>
    );
  const { top, bottom, ink } = coverPalette(storyId);
  return (
    <div
      className={`story-cover generated ${className}`}
      style={{
        background: `radial-gradient(circle at 78% 18%, ${ink}33, transparent 45%), linear-gradient(160deg, ${top}, ${bottom})`,
        color: ink,
      }}
      aria-hidden="true"
    >
      <span>{monogram(title)}</span>
    </div>
  );
}
