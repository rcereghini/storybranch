import { Button } from "./ui";
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
  nextMedia,
  image,
  children,
  onPlaybackChange,
  onOutput,
  disabled,
  transitioning,
  result,
}: {
  page: StoryPage;
  result?: boolean;
  media?: SceneMedia;
  nextMedia?: SceneMedia;
  image?: string;
  children: ReactNode;
  onPlaybackChange: (playing: boolean) => void;
  onOutput: (output: PageOutput) => void;
  disabled: boolean;
  transitioning: boolean;
}) {
  const { save } = useStory();
  useEffect(() => {
    // Warm only one deterministic next clip. Save-data users skip speculation.
    const connection = (
      navigator as Navigator & { connection?: { saveData?: boolean } }
    ).connection;
    if (!nextMedia || connection?.saveData) return;
    const preload = document.createElement("video");
    preload.preload = "auto";
    preload.muted = true;
    preload.src =
      (matchMedia("(max-width: 700px)").matches
        ? nextMedia.portrait
        : undefined
      )?.src ?? nextMedia.landscape.src;
    preload.load();
    return () => {
      preload.removeAttribute("src");
      preload.load();
    };
  }, [nextMedia?.landscape.src, nextMedia?.portrait?.src]);
  const emitted = useRef(false);
  useEffect(() => {
    if (!disabled) emitted.current = false;
  }, [disabled, save.id, save.revision]);
  const emit = (output: PageOutput) => {
    if (disabled || emitted.current) return;
    emitted.current = true;
    onOutput(output);
  };
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
            : type === "reveal"
              ? "YOUR ANSWERS ARE IN"
              : "WHAT WILL YOU DO?"}
      </p>
      {page.choices.map((output, i) => {
        const locked =
          !!output.availableWhen && !evaluate(output.availableWhen, save);
        if (locked && output.unavailableDisplay === "hidden") return null;
        return (
          <Button
            key={output.id}
            disabled={disabled || locked}
            onClick={() =>
              emit({
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
          </Button>
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
          {/* Both video types share this retained player. Completion callbacks
              distinguish linear playback from explicit option selection. */}
          <ScenePlayer
            pending={transitioning}
            sceneId={lastVideo.current.sceneId}
            page={lastVideo.current.page}
            media={lastVideo.current.media}
            poster={image}
            active={video}
            onComplete={
              video &&
              type === "video" &&
              page.videoAdvance !== "continue" &&
              page.choices.length === 1
                ? () => {
                    emit({ choiceId: page.choices[0].id });
                  }
                : undefined
            }
            onNext={
              video && type === "video" && page.choices.length === 1
                ? () => emit({ choiceId: page.choices[0].id })
                : undefined
            }
            onPlaybackChange={onPlaybackChange}
          >
            {outputs}
          </ScenePlayer>
        </div>
      )}
      {!video && (
        <section key={`${save.id}-${page.id}`} className="reading-page">
          <p className="eyebrow">
            {type === "dice"
              ? "DICE ROLL"
              : type === "reveal"
                ? "QUIZ"
                : result
                  ? "YOUR RESULT"
                  : "STORY PAGE"}
          </p>
          <h1 ref={heading} tabIndex={-1}>
            {page.title}
          </h1>
          {image && <img className="page-photo" src={image} alt="" />}
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
