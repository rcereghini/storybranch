import { transitionTiming } from "./transition-timing";
import { Button } from "./ui";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type {
  StoryNode as StoryNodeData,
  StoryNodeOutput,
  Save,
} from "../../../packages/contracts/index";
import { renderStoryNode } from "../../../packages/domain/player";
import type { RenderStoryNode } from "../../../packages/contracts/player";
import type { SceneMedia } from "../../../packages/contracts/media";
import { ScenePlayer } from "./ScenePlayer";
import { ComicStrip } from "./ComicStrip";
import { DiceRoll } from "./DiceRoll";
import { StoryLeafSummary } from "./StoryLeafSummary";
import { useStory } from "./Story";

// Every renderer shares the same persisted input and server-validated outputs.
export function StoryNode({
  storyNode: input,
  media,
  nextMedia,
  image,
  panels,
  children,
  onPlaybackChange,
  onOutput,
  disabled,
  transitioning,
  result,
}: {
  storyNode: StoryNodeData | RenderStoryNode;
  result?: boolean;
  media?: SceneMedia;
  nextMedia?: SceneMedia;
  image?: string;
  // Comic panel images, in panel order.
  panels?: Array<string | undefined>;
  children: ReactNode;
  onPlaybackChange: (playing: boolean) => void;
  onOutput: (output: StoryNodeOutput) => void;
  disabled: boolean;
  transitioning: boolean;
}) {
  const { save } = useStory();
  const storyNode =
    "outputs" in input ? input : renderStoryNode(input, save as Save);
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
  const [rollAttempt, setRollAttempt] = useState<{
    run: string;
    node: string;
    revision: number;
  }>();
  const emitted = useRef(false);
  useEffect(() => {
    if (!disabled) emitted.current = false;
  }, [disabled, save.id, save.revision]);
  const emit = (output: StoryNodeOutput) => {
    if (disabled || emitted.current) return;
    emitted.current = true;
    if (output.action === "roll")
      setRollAttempt({
        run: save.id,
        node: storyNode.id,
        revision: save.revision,
      });
    onOutput(output);
  };
  const heading = useRef<HTMLHeadingElement>(null);
  const type = storyNode.storyNodeType;
  const video = type === "video" || type === "video-options";
  useEffect(() => {
    if (video) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() =>
        transitionTiming.ready(save.id + "-" + save.revision, "content-paint"),
      );
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [save.id, save.revision, video]);
  const lastVideo = useRef<{
    storyNode: RenderStoryNode;
    media?: SceneMedia;
    sceneId: string;
  } | null>(null);
  if (video)
    lastVideo.current = {
      storyNode,
      media,
      sceneId: `${save.id}-${save.revision}`,
    };
  const rolled =
    save.lastRoll?.pending && save.lastRoll.storyNodeId === storyNode.id;
  const outputs = (
    <section className="choices" aria-label="StoryNode outputs">
      <p className="eyebrow">
        {save.status === "completed"
          ? "YOUR STORY, REMEMBERED"
          : type === "dice"
            ? "TEST YOUR LUCK"
            : type === "reveal"
              ? "YOUR ANSWERS ARE IN"
              : "WHAT WILL YOU DO?"}
      </p>
      {storyNode.outputs.map((output, i) => {
        const locked = !output.enabled;
        return (
          <Button
            key={output.id}
            className={locked ? "choice-locked" : undefined}
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
              {type === "dice" && rolled ? "Next" : output.label}
              {output.hint && <small>{output.hint}</small>}
              {output.itemCosts?.map((cost) => (
                <small key={cost.itemId}>
                  Costs {cost.required} {cost.name} · You have {cost.owned}
                </small>
              ))}
              {output.itemCosts?.some((cost) => cost.owned < cost.required) && (
                <small>Not enough items</small>
              )}
            </span>
            <span>{locked ? "Locked" : "↗"}</span>
          </Button>
        );
      })}
      {save.status === "completed" &&
        save.completion?.storyNodeId === storyNode.id && (
          <StoryLeafSummary completion={save.completion} />
        )}
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
  }, [storyNode.id, video]);
  return (
    <article
      className={`story-node story-node-${type}`}
      data-story-node-type={type}
    >
      {lastVideo.current && (
        <div hidden={!video}>
          {/* Both video types share this retained player. Completion callbacks
              distinguish linear playback from explicit option selection. */}
          <ScenePlayer
            pending={transitioning}
            sceneId={lastVideo.current.sceneId}
            storyNode={lastVideo.current.storyNode}
            media={lastVideo.current.media}
            poster={image}
            active={video}
            onComplete={
              video &&
              type === "video" &&
              storyNode.videoAdvance !== "continue" &&
              storyNode.outputs.length === 1
                ? () => {
                    emit({ choiceId: storyNode.outputs[0].id });
                  }
                : undefined
            }
            onNext={
              video && type === "video" && storyNode.outputs.length === 1
                ? () => emit({ choiceId: storyNode.outputs[0].id })
                : undefined
            }
            onPlaybackChange={onPlaybackChange}
          >
            {outputs}
          </ScenePlayer>
        </div>
      )}
      {!video && (
        <section
          key={`${save.id}-${storyNode.id}`}
          className="reading-story-node"
        >
          <p className="eyebrow">
            {type === "dice"
              ? "DICE ROLL"
              : type === "reveal"
                ? "QUIZ"
                : result
                  ? "YOUR RESULT"
                  : type === "comic"
                    ? "COMIC"
                    : "STORYNODE"}
          </p>
          <h1 ref={heading} tabIndex={-1}>
            {storyNode.title}
          </h1>
          {type === "comic" && storyNode.comic ? (
            <ComicStrip comic={storyNode.comic} images={panels ?? []} />
          ) : (
            image && <img className="story-node-photo" src={image} alt="" />
          )}
          <p className="story-node-copy">{storyNode.transcript}</p>
          {type === "dice" && (
            <DiceRoll
              sides={storyNode.diceSides}
              roll={rolled ? save.lastRoll : undefined}
              busy={transitioning}
              attempting={
                rollAttempt?.run === save.id &&
                rollAttempt.node === storyNode.id &&
                (save.revision === rollAttempt.revision ||
                  (!!rolled && save.revision === rollAttempt.revision + 1))
              }
            />
          )}
          {outputs}
        </section>
      )}
    </article>
  );
}
