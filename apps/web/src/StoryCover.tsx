import { coverArt, coverPalette, monogram } from "./cover-palette";

// Shipped artwork for known stories; anything else gets a generated cover
// (its title on a color field; a thumbnail shows only the first letter) so
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
        background: `radial-gradient(circle at 80% 15%, ${ink}2e, transparent 45%), linear-gradient(155deg, ${top}, ${bottom})`,
        color: ink,
      }}
      aria-hidden="true"
    >
      <span>{className.includes("thumb") ? monogram(title) : title}</span>
    </div>
  );
}
