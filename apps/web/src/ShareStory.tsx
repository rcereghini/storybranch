import { useState } from "react";
import type { SceneMedia } from "../../../packages/contracts/media";
export function ShareStory({
  storyId,
  media,
}: {
  storyId: string;
  media?: SceneMedia;
}) {
  const [status, setStatus] = useState("");
  // A public story link, never the private playthrough URL or its ID.
  const url = new URL("/s/glass-harbor", location.origin).href;
  if (storyId !== "glass-harbor") return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setStatus("Story link copied.");
    } catch {
      setStatus(`Copy this story link: ${url}`);
    }
  };
  const share = async () => {
    if (!navigator.share) {
      await copy();
      return;
    }
    try {
      await navigator.share({
        title: "The Glass Harbor",
        text: "A city of secrets. Which path would you take?",
        url,
      });
      setStatus("Share sheet completed.");
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError"))
        setStatus("Sharing is unavailable here. Use Copy story link.");
    }
  };
  return (
    <details className="share-story">
      <summary>Share this adventure</summary>
      <p>Invite someone to choose their own path.</p>
      <div className="share-actions">
        <button onClick={() => void share()}>Share story</button>
        <button onClick={() => void copy()}>Copy story link</button>
        {media?.socialClip && (
          <a
            className="clip-download"
            href={media.socialClip.src}
            download="glass-harbor-vertical-preview.mp4"
          >
            Download vertical teaser · MP4
          </a>
        )}
      </div>
      <p className="muted">
        Local preview: links work on this computer until the app is hosted. The
        six-second teaser uses placeholder art with bell-and-water ambience;
        social posting is manual.
      </p>
      <p role="status">{status}</p>
    </details>
  );
}
