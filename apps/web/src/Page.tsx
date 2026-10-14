import { useEffect, useRef, type ReactNode } from "react";
import type { StoryPage, PageOutput } from "../../../packages/contracts/index";
import { evaluate } from "../../../packages/domain/index";
import type { SceneMedia } from "../../../packages/contracts/media";
import { ScenePlayer } from "./ScenePlayer";
import { useStory } from "./Story";

// Every renderer shares the same persisted input and server-validated outputs.
export function Page({
  page,
  media,
  children,
  onPlaybackChange,
  onOutput,
  disabled,
  transitioning,
}: {
  page: StoryPage;
  media?: SceneMedia;
  children: ReactNode;
  onPlaybackChange: (playing: boolean) => void;
  onOutput: (output: PageOutput) => void;
  disabled: boolean;
  transitioning: boolean;
}) {
  const { save } = useStory();
  const heading = useRef<HTMLHeadingElement>(null);
  const type = page.pageType;
  const video = type === "video" || type === "video-options";
  const lastVideo = useRef<{
    page: StoryPage;
    media?: SceneMedia;
    sceneId: string;
  } | null>(null);
  if (video)
    lastVideo.current = { page, media, sceneId: `${save.id}-${save.revision}` };
  const rolled = save.lastRoll?.pending && save.lastRoll.pageId === page.id;
  const outputs = (
    <section className="choices" aria-label="Page outputs">
      <p className="eyebrow">
        {save.status === "completed"
          ? "YOUR STORY, REMEMBERED"
          : type === "dice"
            ? "TEST YOUR LUCK"
            : "WHAT WILL YOU DO?"}
      </p>
      {page.choices.map((output, i) => {
        const locked =
          !!output.availableWhen && !evaluate(output.availableWhen, save);
        if (locked && output.unavailableDisplay === "hidden") return null;
        return (
          <button
            key={output.id}
            disabled={disabled || locked}
            onClick={() =>
              onOutput({
                choiceId: output.id,
                ...(type === "dice"
                  ? ({ action: rolled ? "continue" : "roll" } as const)
                  : {}),
              })
            }
          >
            <span className="choice-number">
              {locked ? "⌑" : String(i + 1).padStart(2, "0")}
            </span>
            <span>
              {type === "dice" && rolled ? "Next page" : output.label}
              {output.hint && <small>{output.hint}</small>}
            </span>
            <span>{locked ? "Locked" : "↗"}</span>
          </button>
        );
      })}
      {children}
    </section>
  );
  useEffect(() => {
    if (!video) onPlaybackChange(false);
  }, [video, onPlaybackChange]);
  useEffect(() => {
    if (!video) {
      heading.current?.focus();
      heading.current?.scrollIntoView({ block: "center" });
    }
  }, [page.id, video]);
  return (
    <article className={`story-page page-${type}`} data-page-type={type}>
      {lastVideo.current && (
        <div hidden={!video}>
          <ScenePlayer
            pending={transitioning}
            sceneId={lastVideo.current.sceneId}
            page={lastVideo.current.page}
            media={lastVideo.current.media}
            active={video}
            onComplete={
              video && type === "video" && page.choices.length === 1
                ? () => {
                    if (!disabled) onOutput({ choiceId: page.choices[0].id });
                  }
                : undefined
            }
            onPlaybackChange={onPlaybackChange}
          >
            {outputs}
          </ScenePlayer>
        </div>
      )}
      {!video && (
        <section className="reading-page">
          <p className="eyebrow">
            {type === "dice" ? "DICE ROLL" : "STORY PAGE"}
          </p>
          <h1 ref={heading} tabIndex={-1}>
            {page.title}
          </h1>
          <p className="page-copy">{page.transcript}</p>
          {type === "dice" && (
            <div
              className="dice-face"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              <span className="dice-result-label">
                {rolled ? "You rolled" : "Ready to roll"}
              </span>
              <strong>
                {rolled
                  ? save.lastRoll!.value
                  : `◇ d${page.choices[0].outcome.kind === "dice" ? page.choices[0].outcome.sides : "?"}`}
              </strong>
              <span className="dice-result-detail">
                {rolled
                  ? `${save.lastRoll!.passed ? "Pass" : "Fail"} · Target ${save.lastRoll!.target}`
                  : "Roll to reveal your result"}
              </span>
            </div>
          )}
          {outputs}
        </section>
      )}
    </article>
  );
}
