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
  pending?: boolean;
};
export function ScenePlayer({
  sceneId,
  page,
  media,
  children,
  onPlaybackChange,
  active: visible = true,
  onComplete,
  pending = false,
}: Props) {
  const [portrait, setPortrait] = useState(
    () => matchMedia("(max-width: 700px)").matches,
  );
  const [watching, setWatching] = useState(false),
    [blocked, setBlocked] = useState(false),
    [failed, setFailed] = useState(false),
    [retry, setRetry] = useState(0);
  const video = useRef<HTMLVideoElement>(null);
  const frame = useRef<HTMLCanvasElement>(null);
  const [buffering, setBuffering] = useState(false);
  const [muted, setMuted] = useState(false);
  const [captions, setCaptions] = useState(true);
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
    if (element && frame.current && element.readyState >= 2) {
      const canvas = frame.current;
      canvas.width = element.videoWidth;
      canvas.height = element.videoHeight;
      try {
        canvas.getContext("2d")?.drawImage(element, 0, 0);
      } catch {
        /* Media can still play when frame capture is unavailable. */
      }
    }
    if (!visible) {
      setBuffering(false);
      element?.pause();
      return;
    }
    // Reuse the authorized media element across committed scenes. Loading the
    // new source resets its timeline even when fixtures reuse the same URL.
    element?.load();
    setBuffering(true);
    // Start automatically when the story opens; keep this authorized element
    // for subsequent pages. A denied play gets one prominent gesture fallback.
    element?.play().catch((error: unknown) => {
      if (
        !active ||
        (error instanceof DOMException && error.name === "AbortError")
      )
        return;
      setWatching(false);
      setBuffering(false);
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
        track.mode = watching && captions ? "showing" : "disabled";
  }, [watching, captions]);
  const play = async () => {
    try {
      if (video.current) {
        if (video.current.ended) video.current.currentTime = 0;
        await video.current.play();
      }
      setBlocked(false);
    } catch (error) {
      setBuffering(false);
      if (error instanceof DOMException && error.name === "NotAllowedError")
        setBlocked(true);
      else if (!(error instanceof DOMException && error.name === "AbortError"))
        setFailed(true);
      setWatching(false);
    }
  };
  const skip = () => {
    setBuffering(false);
    video.current?.pause();
    setWatching(false);
  };
  const fail = () => {
    setBuffering(false);
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
          controls={false}
          muted={muted}
          playsInline
          preload="metadata"
          poster={media ? rendition?.poster : "/media/harbor.svg"}
          onPlaying={() => {
            setBuffering(false);
            setWatching(true);
            setBlocked(false);
          }}
          onWaiting={() => {
            const element = video.current,
              canvas = frame.current;
            if (
              element &&
              canvas &&
              element.currentTime > 0 &&
              element.readyState >= 2
            ) {
              canvas.width = element.videoWidth;
              canvas.height = element.videoHeight;
              try {
                canvas.getContext("2d")?.drawImage(element, 0, 0);
              } catch {
                /* Keep playing if capture is unavailable. */
              }
            }
            setBuffering(true);
          }}
          onPause={() => {
            if ((video.current?.readyState ?? 0) >= 3) setWatching(false);
          }}
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
          {(!media || media.captions) && (
            <track
              kind="captions"
              src={media?.captions ?? "/media/harbor.vtt"}
              srcLang="en"
              label="English"
              default
            />
          )}
        </video>
        <canvas
          ref={frame}
          className={`scene-held-frame ${buffering ? "visible" : ""}`}
          aria-hidden="true"
        />
        {blocked && (
          <button
            className="scene-start primary"
            onClick={() => void play()}
            disabled={failed}
          >
            Start story with sound
          </button>
        )}
        <span className="scene-film-label">STORYBRANCH · PLACEHOLDER FILM</span>
        <div
          className="scene-overlay"
          aria-hidden={
            watching || ((buffering || pending) && !blocked && !failed)
          }
          inert={watching || ((buffering || pending) && !blocked && !failed)}
        >
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
          onClick={() => {
            const stage = video.current?.parentElement;
            if (document.fullscreenElement) void document.exitFullscreen();
            else void stage?.requestFullscreen?.().catch(() => {});
          }}
        >
          Fullscreen
        </button>
        <button
          onClick={() => (watching ? skip() : void play())}
          disabled={failed || buffering || pending}
        >
          {watching ? "Pause video" : "Play video"}
        </button>
        <button aria-pressed={muted} onClick={() => setMuted(!muted)}>
          {muted ? "Unmute" : "Mute"}
        </button>
        <button aria-pressed={captions} onClick={() => setCaptions(!captions)}>
          Captions
        </button>
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
              : "Watch scene"}
        </button>
        <span aria-live="polite">
          {watching
            ? buffering
              ? "Buffering…"
              : captions
                ? "Playing · captions on"
                : "Playing"
            : blocked
              ? "Press Play scene to start with sound. Your browser requires a tap."
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
