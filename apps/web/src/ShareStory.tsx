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

// On an ending StoryNode the panel leads with a shareable ending card; elsewhere
// it shares the story. Links never contain the private playthrough ID.
export function ShareStory({
  storyId,
  storyTitle,
  ending,
  media,
}: {
  storyId: string;
  storyTitle: string;
  ending?: { storyNodeId: string; title: string; result?: boolean };
  media?: SceneMedia;
}) {
  const [status, setStatus] = useState("");
  const story = storyLink(storyId);
  const endingUrl = ending ? endingLink(storyId, ending.storyNodeId) : null;
  const what = ending?.result ? "Result link" : "Ending link";
  const clip = media?.socialClip;
  const fileSharing = !!clip && canShareFiles();
  return (
    <details className="share-story">
      <summary>
        {ending?.result
          ? "Share your result"
          : ending
            ? "Share your ending"
            : "Share this adventure"}
      </summary>
      {ending ? (
        <div className="ending-card" aria-label="Ending share card">
          <span className="ending-card-eyebrow">
            {ending.result ? "MY RESULT" : "I REACHED AN ENDING"}
          </span>
          <strong>{ending.title}</strong>
          <span>
            in {storyTitle} ·{" "}
            {ending.result
              ? "What will you get?"
              : "Which ending will you find?"}
          </span>
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
                      text: ending.result
                        ? `I got “${ending.title}” in ${storyTitle}. What will you get?`
                        : `I reached “${ending.title}” in ${storyTitle}. Which ending will you find?`,
                      url: endingUrl,
                    },
                    what,
                  ),
                )
              }
            >
              {ending.result ? "Share result" : "Share ending"}
            </button>
            <button
              onClick={async () => setStatus(await copyLink(endingUrl, what))}
            >
              {ending.result ? "Copy result link" : "Copy ending link"}
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
