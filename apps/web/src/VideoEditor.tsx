import { useEffect, useRef, useState } from "react";
import type { ClipAsset } from "../../../packages/contracts/media";
import { Button, Panel } from "./ui";
import { uploadAsset } from "./asset-upload";
import { cropRect, exportVideo, type VideoEdit } from "./video-export";
type Api = <T>(path: string, body?: unknown) => Promise<T>;

export function VideoEditor({
  asset,
  api,
  onSaved,
  onClose,
}: {
  asset: ClipAsset;
  api: Api;
  onSaved: (asset: ClipAsset) => void;
  onClose: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    abort = useRef<AbortController | null>(null);
  const [length, setLength] = useState(asset.durationSeconds),
    [ready, setReady] = useState(false);
  const [edit, setEdit] = useState<VideoEdit>({
    start: 0,
    end: asset.durationSeconds,
    aspect: "original",
    x: 50,
    y: 50,
    mute: false,
  });
  const [name, setName] = useState(
    asset.fileName.replace(/\.[^.]+$/, "") + " edited",
  );
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const [output, setOutput] = useState<File | null>(null);
  const valid =
    ready &&
    edit.end - edit.start >= 0.1 &&
    edit.end <= length &&
    edit.start >= 0 &&
    name.trim().length > 0 &&
    !/[\/\\\p{C}]/u.test(name);
  const draw = () => {
    const v = video.current,
      c = canvas.current;
    if (!v || !c || v.readyState < 2) return;
    const r = cropRect(v.videoWidth, v.videoHeight, edit);
    c.width = 640;
    c.height = Math.round((640 * r.h) / r.w);
    c.getContext("2d")?.drawImage(
      v,
      r.x,
      r.y,
      r.w,
      r.h,
      0,
      0,
      c.width,
      c.height,
    );
  };
  useEffect(() => {
    draw();
  }, [edit]);
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    setOutput(null);
  }, [edit, name]);
  return (
    <Panel className="video-workspace" aria-label="Edit video">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="eyebrow">ASSET WORKSHOP</p>
          <h1>Edit video</h1>
        </div>
        <Button disabled={busy} onClick={onClose}>
          Back to assets
        </Button>
      </div>
      <p>
        Trim a clip, reframe it, or remove its audio. Save a new copy to your
        library.
      </p>
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <video
            ref={video}
            crossOrigin="anonymous"
            className="w-full rounded-xl"
            controls
            playsInline
            src={asset.media!.landscape.src}
            muted={edit.mute}
            onLoadedMetadata={(e) => {
              const d = e.currentTarget.duration;
              if (Number.isFinite(d)) {
                setLength(d);
                setEdit((old) => ({ ...old, end: d }));
              }
              setReady(true);
            }}
            onLoadedData={draw}
            onSeeked={draw}
            onError={() => {
              setReady(false);
              setNotice("This video could not be loaded.");
            }}
            onTimeUpdate={(e) => {
              draw();
              if (e.currentTarget.currentTime >= edit.end)
                e.currentTarget.pause();
            }}
          />
          <Button
            disabled={!valid || busy}
            onClick={() => {
              video.current!.currentTime = edit.start;
              void video
                .current!.play()
                .catch(() => setNotice("Press Play on the video to preview."));
            }}
          >
            Preview selected clip
          </Button>
          <p className="muted">Crop preview</p>
          <canvas ref={canvas} className="video-crop-preview" />
        </div>
        <div className="grid content-start gap-4">
          <label>
            Asset name
            <input
              maxLength={100}
              value={name}
              disabled={busy}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            {(["start", "end"] as const).map((key) => (
              <label key={key}>
                {key === "start"
                  ? "Clip start (seconds)"
                  : "Clip end (seconds)"}
                <input
                  type="number"
                  step="0.1"
                  min={0}
                  max={length}
                  value={edit[key]}
                  disabled={busy}
                  onChange={(e) =>
                    setEdit({ ...edit, [key]: Number(e.target.value) })
                  }
                />
              </label>
            ))}
          </div>
          <label>
            Crop
            <select
              aria-label="Crop"
              value={edit.aspect}
              disabled={busy}
              onChange={(e) =>
                setEdit({
                  ...edit,
                  aspect: e.target.value as VideoEdit["aspect"],
                })
              }
            >
              <option value="original">Original</option>
              <option value="16:9">Landscape · 16:9</option>
              <option value="9:16">Portrait · 9:16</option>
              <option value="1:1">Square · 1:1</option>
            </select>
          </label>
          {edit.aspect !== "original" &&
            (["x", "y"] as const).map((key) => (
              <label key={key}>
                {key === "x" ? "Horizontal framing" : "Vertical framing"}
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={edit[key]}
                  disabled={busy}
                  onChange={(e) =>
                    setEdit({ ...edit, [key]: Number(e.target.value) })
                  }
                />
              </label>
            ))}
          <label>
            <input
              type="checkbox"
              checked={edit.mute}
              disabled={busy}
              onChange={(e) => setEdit({ ...edit, mute: e.target.checked })}
            />{" "}
            Remove audio
          </label>
          <p>
            {Math.max(0, edit.end - edit.start).toFixed(1)} seconds selected.
            Export runs in real time; keep this tab visible.
          </p>
          <Button
            disabled={busy || !valid}
            onClick={async () => {
              setBusy(true);
              abort.current = new AbortController();
              try {
                video.current?.pause();
                const file =
                  output ??
                  (await exportVideo(
                    [{ src: asset.media!.landscape.src, edit }],
                    abort.current.signal,
                    setNotice,
                  ));
                setOutput(file);
                const saved = await uploadAsset(
                  api,
                  new File([file], `${name.trim()}.webm`, {
                    type: "video/webm",
                  }),
                  setNotice,
                  edit.end - edit.start,
                );
                onSaved(saved);
                setNotice("Saved a new video to your assets.");
                setOutput(null);
              } catch (e) {
                setNotice((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {output ? "Retry saving export" : "Save edited video"}
          </Button>
          {busy && (
            <Button onClick={() => abort.current?.abort()}>
              Cancel export
            </Button>
          )}
          <p className="min-h-16" role="status">
            {notice}
          </p>
        </div>
      </div>
    </Panel>
  );
}
