import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Story } from "../../../packages/contracts/index";
import type { SceneMedia } from "../../../packages/contracts/media";
import "./scene-player.css";
type Props = {
  sceneId: string;
  page: Story["pages"][string];
  media?: SceneMedia;
  children: ReactNode;
  onPlaybackChange: (playing: boolean) => void;
  active?: boolean;
  onComplete?: () => void;
};
export function ScenePlayer({
  sceneId,
  page,
  media,
  children,
  onPlaybackChange,
  active: visible = true,
  onComplete,
}: Props) {
  const [portrait, setPortrait] = useState(
    () => matchMedia("(max-width: 700px)").matches,
  );
  const [watching, setWatching] = useState(false),
    [blocked, setBlocked] = useState(false),
    [failed, setFailed] = useState(false),
    [retry, setRetry] = useState(0);
  const video = useRef<HTMLVideoElement>(null);
  const started = useRef(false);
  const [hasStarted, setHasStarted] = useState(false);
  useEffect(() => {
    const query = matchMedia("(max-width: 700px)");
    const update = () => setPortrait(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const rendition =
    portrait && media?.portrait ? media.portrait : media?.landscape;
  const source = rendition?.src ?? page.video;
  useEffect(() => {
    let active = true;
    setWatching(false);
    setFailed(false);
    setBlocked(false);
    const element = video.current;
    if (!visible) {
      element?.pause();
      return;
    }
    // Reuse the authorized media element across committed scenes. Loading the
    // new source resets its timeline even when fixtures reuse the same URL.
    element?.load();
    // The first audible play is directly inside a user gesture, not an effect
    // after authentication, routing, or a save request has completed.
    if (!started.current) return;
    element?.play().catch((error: unknown) => {
      if (
        !active ||
        (error instanceof DOMException && error.name === "AbortError")
      )
        return;
      setWatching(false);
      if (error instanceof DOMException && error.name === "NotAllowedError")
        setBlocked(true);
      else setFailed(true);
    });
    return () => {
      active = false;
    };
  }, [source, retry, sceneId, visible]);
  useEffect(() => {
    onPlaybackChange(watching);
    return () => onPlaybackChange(false);
  }, [watching, onPlaybackChange]);
  useEffect(() => {
    if (video.current)
      for (const track of video.current.textTracks)
        track.mode = watching ? "showing" : "disabled";
  }, [watching]);
  const play = async () => {
    started.current = true;
    setHasStarted(true);
    try {
      if (video.current) {
        if (video.current.ended) video.current.currentTime = 0;
        await video.current.play();
      }
      setBlocked(false);
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotAllowedError")
        setBlocked(true);
      else if (!(error instanceof DOMException && error.name === "AbortError"))
        setFailed(true);
      setWatching(false);
    }
  };
  const skip = () => {
    video.current?.pause();
    setWatching(false);
  };
  const fail = () => {
    setFailed(true);
    setWatching(false);
  };
  return (
    <div className="scene-player">
      <div
        className={`scene-stage ${portrait ? "portrait" : "landscape"} ${watching ? "watching" : "deciding"}`}
      >
        <video
          ref={video}
          controls={watching}
          playsInline
          preload="metadata"
          poster={rendition?.poster ?? "/media/harbor.svg"}
          onPlaying={() => {
            setWatching(true);
            setBlocked(false);
          }}
          onWaiting={() => setWatching(false)}
          onPause={() => setWatching(false)}
          onEnded={() => {
            setWatching(false);
            onComplete?.();
          }}
          onError={fail}
          aria-label={`${page.title} scene video`}
        >
          <source
            src={source}
            type={rendition?.type ?? "video/webm"}
            onError={fail}
          />
          <track
            kind="captions"
            src={media?.captions ?? "/media/harbor.vtt"}
            srcLang="en"
            label="English"
            default
          />
        </video>
        {!hasStarted && (
          <button
            className="scene-start primary"
            onClick={() => void play()}
            disabled={failed}
          >
            Start story with sound
          </button>
        )}
        <span className="scene-film-label">STORYBRANCH · PLACEHOLDER FILM</span>
        <div className="scene-overlay" aria-hidden={watching} inert={watching}>
          <div className="scene-copy">
            <p className="eyebrow">
              {page.kind === "ending"
                ? "YOUR STORY, REMEMBERED"
                : "YOUR NEXT MOVE"}
            </p>
            <h1>{page.title}</h1>
            <p>{page.transcript}</p>
          </div>
          {children}
        </div>
      </div>
      <div className="scene-toolbar">
        <button
          onClick={() =>
            watching ? (onComplete ? onComplete() : skip()) : void play()
          }
          disabled={failed}
        >
          {watching
            ? onComplete
              ? "Next page"
              : "Skip to choices"
            : blocked
              ? "Play scene"
              : !hasStarted
                ? "Play scene"
                : "Watch scene"}
        </button>
        <span aria-live="polite">
          {watching
            ? "Playing · captions on"
            : blocked
              ? "Press Play scene to start with sound. Your browser requires a tap."
              : !hasStarted
                ? "Start playback once; your choices continue the story."
                : "Scene paused · choose at your own pace"}
        </span>
        <a
          href="#scene-transcript"
          onClick={() => {
            skip();
            const details = document.getElementById(
              "scene-transcript",
            ) as HTMLDetailsElement | null;
            if (details) details.open = true;
          }}
        >
          Read transcript ↓
        </a>
      </div>
      {failed && (
        <div className="notice" role="status">
          The clip couldn’t load. Read the transcript and choose your path.
          <button
            onClick={() => {
              setFailed(false);
              setRetry((r) => r + 1);
            }}
          >
            Retry video
          </button>
        </div>
      )}
      <details className="transcript" id="scene-transcript">
        <summary>Scene transcript</summary>
        <p>{page.transcript}</p>
      </details>
    </div>
  );
}
