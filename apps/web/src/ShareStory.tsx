import { useState } from "react";
import type { SceneMedia } from "../../../packages/contracts/media";
import {
  canShareFiles,
  copyLink,
  endingLink,
  shareClip,
  shareLink,
  storyLink,
} from "./share";

// On an ending page the panel leads with a shareable ending card; elsewhere
// it shares the story. Links never contain the private playthrough ID.
export function ShareStory({
  storyId,
  storyTitle,
  ending,
  media,
}: {
  storyId: string;
  storyTitle: string;
  ending?: { pageId: string; title: string };
  media?: SceneMedia;
}) {
  const [status, setStatus] = useState("");
  const story = storyLink(storyId);
  const endingUrl = ending ? endingLink(storyId, ending.pageId) : null;
  const clip = media?.socialClip;
  const fileSharing = !!clip && canShareFiles();
  return (
    <details className="share-story">
      <summary>{ending ? "Share your ending" : "Share this adventure"}</summary>
      {ending ? (
        <div className="ending-card" aria-label="Ending share card">
          <span className="ending-card-eyebrow">I REACHED AN ENDING</span>
          <strong>{ending.title}</strong>
          <span>in {storyTitle} · Which ending will you find?</span>
        </div>
      ) : (
        <p>Invite someone to choose their own path.</p>
      )}
      <div className="share-actions">
        {ending && endingUrl && (
          <>
            <button
              onClick={async () =>
                setStatus(
                  await shareLink(
                    {
                      title: `${ending.title} · ${storyTitle}`,
                      text: `I reached “${ending.title}” in ${storyTitle}. Which ending will you find?`,
                      url: endingUrl,
                    },
                    "Ending link",
                  ),
                )
              }
            >
              Share ending
            </button>
            <button
              onClick={async () =>
                setStatus(await copyLink(endingUrl, "Ending link"))
              }
            >
              Copy ending link
            </button>
          </>
        )}
        {!ending && (
          <button
            onClick={async () =>
              setStatus(
                await shareLink(
                  {
                    title: storyTitle,
                    text: `${storyTitle}: which path would you take?`,
                    url: story,
                  },
                  "Story link",
                ),
              )
            }
          >
            Share story
          </button>
        )}
        <button
          onClick={async () => setStatus(await copyLink(story, "Story link"))}
        >
          Copy story link
        </button>
        {clip && fileSharing && (
          <button
            onClick={async () => {
              const result = await shareClip(clip.src, storyTitle, story);
              setStatus(
                result ??
                  "This browser can't share video. Download it instead.",
              );
            }}
          >
            Share teaser video
          </button>
        )}
        {clip && (
          <a
            className="clip-download"
            href={clip.src}
            download={`${storyId}-vertical-preview.mp4`}
          >
            Download vertical teaser · MP4
          </a>
        )}
      </div>
      <p className="muted">
        Links open the story for anyone; your own save stays private.
        {clip
          ? " The teaser is a six-second vertical clip for social posts."
          : ""}
      </p>
      <p role="status">{status}</p>
    </details>
  );
}
