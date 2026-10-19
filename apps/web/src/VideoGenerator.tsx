import { useEffect, useRef, useState } from "react";
import type {
  ClipAsset,
  UploadListing,
} from "../../../packages/contracts/media";
import type {
  GenerationCommand,
  GenerationJob,
  GenerationListing,
} from "../../../packages/contracts/generation";
import { Button, Panel } from "./ui";
import { ClipPicker } from "./ClipPicker";
import { uploadAsset } from "./asset-upload";
import { exportVideo } from "./video-export";
import { generationCommand } from "../../../packages/contracts/generation";
import { ApiError } from "../../../packages/api-client/index";
type Api = <T>(path: string, body?: unknown) => Promise<T>;
type Draft = { prompt: string; frames: string[]; framePrompt: string };

export function VideoGenerator({
  api,
  uploads,
  uid,
  onAsset,
  onClose,
}: {
  api: Api;
  uploads: UploadListing | null;
  uid: string;
  onAsset: (asset: ClipAsset) => void;
  onClose: () => void;
}) {
  const storageKey = `storybranch-video-draft-${uid}`;
  const [draft, setDraft] = useState<Draft>(() => {
    try {
      const d = JSON.parse(localStorage.getItem(storageKey) ?? "null");
      if (
        typeof d?.prompt === "string" &&
        typeof d?.framePrompt === "string" &&
        Array.isArray(d?.frames) &&
        d.frames.every((x: unknown) => typeof x === "string")
      )
        return d;
    } catch {}
    return { prompt: "", frames: [], framePrompt: "" };
  });
  const [listing, setListing] = useState<GenerationListing | null>(null),
    [step, setStep] = useState(1),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const [reference, setReference] = useState("");
  const [suggestions, setSuggestions] = useState<ClipAsset[]>([]);
  const [selectedClips, setSelectedClips] = useState<string[]>([]);
  const alive = useRef(true),
    controller = useRef<AbortController | null>(null);
  const pending = useRef<GenerationCommand | null>(
    (() => {
      try {
        return generationCommand.parse(
          JSON.parse(localStorage.getItem(`${storageKey}-request`) ?? "null"),
        );
      } catch {
        return null;
      }
    })(),
  );
  const remember = (command: GenerationCommand | null) => {
    pending.current = command;
    try {
      if (command)
        localStorage.setItem(`${storageKey}-request`, JSON.stringify(command));
      else localStorage.removeItem(`${storageKey}-request`);
    } catch {}
  };
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(draft));
    } catch {}
  }, [draft, storageKey]);
  const load = async () => {
    const data = await api<GenerationListing>("/generation");
    setListing(data);
    return data;
  };
  useEffect(() => {
    alive.current = true;
    void load().catch((e) => setNotice(e.message));
    return () => {
      alive.current = false;
      controller.current?.abort();
    };
  }, []);
  const images =
    uploads?.items.filter((a) => a.status === "ready" && a.url) ?? [];
  const frames = draft.frames.map((id) => images.find((a) => a.id === id));
  const add = (asset: ClipAsset) => {
    onAsset(asset);
    if (asset.url)
      setDraft((d) => ({
        ...d,
        frames: d.frames.includes(asset.id)
          ? d.frames
          : [...d.frames, asset.id].slice(0, 6),
      }));
  };
  const record = (job: GenerationJob) => {
    setListing((old) =>
      old
        ? { ...old, jobs: [job, ...old.jobs.filter((j) => j.id !== job.id)] }
        : old,
    );
    if (job.asset) onAsset(job.asset);
  };
  const wait = async (job: GenerationJob) => {
    while (job.status === "queued" || job.status === "submitting") {
      if (!alive.current || controller.current?.signal.aborted)
        throw new Error(
          "Stopped waiting. Submitted jobs remain in Recent generations; check their status to recover results.",
        );
      setNotice(
        job.kind === "video"
          ? "Generating video. This can take a few minutes…"
          : "Generating your frame…",
      );
      await new Promise((resolve) => setTimeout(resolve, 4000));
      if (!alive.current || controller.current?.signal.aborted) continue;
      job = await api<GenerationJob>(`/generation/${job.id}`, {});
      record(job);
    }
    if (job.status !== "ready" || !job.asset)
      throw new Error(
        job.message ??
          "Submission needs checking in the fal dashboard before retrying.",
      );
    return job.asset;
  };
  const generate = async (
    command:
      | Omit<Extract<GenerationCommand, { kind: "image" }>, "idempotencyKey">
      | Omit<Extract<GenerationCommand, { kind: "video" }>, "idempotencyKey">,
  ) => {
    const next = {
      ...command,
      idempotencyKey: crypto.randomUUID(),
    } as GenerationCommand;
    // Keep the same request on a transport retry; do not silently create another billed job.
    if (!pending.current) remember(next);
    const job = await api<GenerationJob>("/generation", pending.current);
    remember(null);
    record(job);
    return wait(job);
  };
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    controller.current = new AbortController();
    try {
      await fn();
    } catch (e) {
      if (e instanceof ApiError && e.code !== "UNAVAILABLE") remember(null);
      setNotice((e as Error).message);
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const combine = async (clips: ClipAsset[]) => {
    if (clips.length === 1) {
      setNotice("Generated video saved to your asset library.");
      return;
    }
    const file = await exportVideo(
      clips.map((a) => ({
        src: a.media!.landscape.src,
        edit: {
          start: 0,
          end: a.durationSeconds,
          aspect: "original",
          x: 50,
          y: 50,
          mute: true,
        },
      })),
      controller.current!.signal,
      setNotice,
    );
    const asset = await uploadAsset(
      api,
      new File([file], "generated-sequence.webm", { type: "video/webm" }),
      setNotice,
      clips.reduce((sum, clip) => sum + clip.durationSeconds, 0),
    );
    onAsset(asset);
    setNotice(
      "Complete video saved to your asset library. Individual shots are saved too.",
    );
  };
  const ready =
    !!listing?.enabled && !busy && !!uploads?.enabled && !pending.current;
  return (
    <section className="video-workspace" aria-label="Generate video">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="eyebrow">FROM IDEA TO MOTION</p>
          <h1>Generate video</h1>
        </div>
        <Button disabled={busy} onClick={onClose}>
          Back to assets
        </Button>
      </div>
      <p>
        Describe a scene. Shape its keyframes. Bring the moments between them to
        life.
      </p>
      <nav className="video-steps" aria-label="Generation steps">
        {["Describe", "Build keyframes", "Generate"].map((name, i) => (
          <Button
            key={name}
            disabled={busy || (i > 0 && draft.prompt.trim().length < 3)}
            aria-current={step === i + 1 ? "step" : undefined}
            onClick={() => setStep(i + 1)}
          >
            <span>0{i + 1}</span> {name}
          </Button>
        ))}
      </nav>
      {step === 1 && (
        <Panel>
          <h2>What happens in your scene?</h2>
          <p>Describe the subject, setting, movement, and visual style.</p>
          <label>
            Scene prompt
            <textarea
              rows={5}
              maxLength={1400}
              value={draft.prompt}
              onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
              placeholder="A lone traveler approaches a lantern-lit gate in the rain. Slow camera push, cinematic lighting…"
            />
          </label>
          <Button
            disabled={draft.prompt.trim().length < 3}
            onClick={() => setStep(2)}
          >
            Build keyframes →
          </Button>
        </Panel>
      )}
      {step === 2 && (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <Panel>
            <h2>Your keyframe timeline</h2>
            <p>
              Select two to six frames. Each neighboring pair becomes a short
              shot, in this order.
            </p>
            <div className="keyframe-grid">
              {frames.map((asset, i) => (
                <div className="keyframe-card" key={draft.frames[i]}>
                  {asset?.url ? (
                    <img src={asset.url} alt={`Keyframe ${i + 1}`} />
                  ) : (
                    <div className="aspect-video">
                      Image unavailable — remove or replace
                    </div>
                  )}
                  <strong>
                    {i === 0
                      ? "First frame"
                      : i === frames.length - 1
                        ? "Last frame"
                        : `Keyframe ${i + 1}`}
                  </strong>
                  <div className="flex gap-2">
                    <Button
                      aria-label={`Move frame ${i + 1} earlier`}
                      disabled={busy || i === 0}
                      onClick={() => {
                        const next = [...draft.frames];
                        [next[i - 1], next[i]] = [next[i], next[i - 1]];
                        setDraft({ ...draft, frames: next });
                      }}
                    >
                      ←
                    </Button>
                    <Button
                      aria-label={`Move frame ${i + 1} later`}
                      disabled={busy || i === frames.length - 1}
                      onClick={() => {
                        const next = [...draft.frames];
                        [next[i + 1], next[i]] = [next[i], next[i + 1]];
                        setDraft({ ...draft, frames: next });
                      }}
                    >
                      →
                    </Button>
                    <Button
                      disabled={busy}
                      aria-label={`Remove frame ${i + 1}`}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          frames: draft.frames.filter((_, n) => n !== i),
                        })
                      }
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            {!frames.length && (
              <div className="video-empty">
                Your first frame sets the scene. Upload an image, choose an
                asset, or generate one.
              </div>
            )}
            <h3>Choose from your assets</h3>
            <div className="frame-assets">
              {images.map((asset) => (
                <button
                  type="button"
                  key={asset.id}
                  title={asset.fileName}
                  aria-label={`Use frame ${asset.fileName}`}
                  aria-pressed={draft.frames.includes(asset.id)}
                  disabled={
                    busy ||
                    (!draft.frames.includes(asset.id) && frames.length >= 6)
                  }
                  onClick={() =>
                    setDraft({
                      ...draft,
                      frames: draft.frames.includes(asset.id)
                        ? draft.frames.filter((id) => id !== asset.id)
                        : [...draft.frames, asset.id],
                    })
                  }
                >
                  <img src={asset.url} alt="" />
                  <span>{asset.fileName}</span>
                </button>
              ))}
            </div>
            <ClipPicker
              kind="image"
              api={api}
              uploads={uploads}
              value={undefined}
              disabled={busy || frames.length >= 6}
              onChange={(value) => {
                const asset = images.find((a) => `asset:${a.id}` === value);
                if (asset) add(asset);
              }}
              onUploaded={add}
            />
            <Button
              disabled={busy || frames.length < 2 || frames.some((a) => !a)}
              onClick={() => setStep(3)}
            >
              Review video →
            </Button>
          </Panel>
          <Panel>
            <h2>Create a frame</h2>
            <label>
              Frame direction
              <textarea
                rows={4}
                maxLength={350}
                value={draft.framePrompt}
                onChange={(e) =>
                  setDraft({ ...draft, framePrompt: e.target.value })
                }
                placeholder="Establish the scene, with the traveler in the foreground…"
              />
            </label>
            <label>
              Reference image
              <select
                value={reference}
                disabled={busy}
                onChange={(e) => setReference(e.target.value)}
              >
                <option value="">Generate from text</option>
                {images.map((a) => (
                  <option value={a.id} key={a.id}>
                    {a.fileName}
                  </option>
                ))}
              </select>
            </label>
            <Button
              disabled={
                !ready || frames.length >= 6 || draft.prompt.trim().length < 3
              }
              onClick={() =>
                void run(async () => {
                  const asset = await generate({
                    kind: "image",
                    prompt: `${draft.prompt}\n${draft.framePrompt}`,
                    quality: "high",
                    aspect: "16:9",
                    ...(reference ? { referenceIds: [reference] } : {}),
                  });
                  add(asset);
                  setReference(asset.id);
                  setNotice(
                    "Frame saved. Select a suggested direction or write your next moment.",
                  );
                })
              }
            >
              Generate frame
            </Button>
            <h3>Suggested next moments</h3>
            <p className="muted">
              Shot ideas to adapt before generating an image.
            </p>
            <Button
              disabled={!ready || !frames.length || frames.some((a) => !a)}
              onClick={() =>
                void run(async () => {
                  const referenceId = reference || frames.at(-1)!.id;
                  setSuggestions([]);
                  for (const direction of [
                    "Move closer to the subject.",
                    "Show the action beginning.",
                    "Reveal the final moment.",
                  ]) {
                    if (controller.current?.signal.aborted) break;
                    const asset = await generate({
                      kind: "image",
                      quality: "high",
                      aspect: "16:9",
                      referenceIds: [referenceId],
                      prompt: `${draft.prompt}\n${direction} Preserve the subject, setting and lighting.`,
                    });
                    onAsset(asset);
                    setSuggestions((old) => [...old, asset]);
                  }
                  setNotice(
                    "Frame suggestions saved. Choose the ones you want in your timeline.",
                  );
                })
              }
            >
              Generate 3 frame suggestions
            </Button>
            <p className="muted">
              Uses three paid reference-image requests.{" "}
              <a
                href="https://fal.ai/models/fal-ai/flux/dev/image-to-image"
                target="_blank"
                rel="noreferrer"
              >
                View image pricing
              </a>
              .
            </p>
            {suggestions.map((asset) => (
              <div className="keyframe-card" key={asset.id}>
                <img src={asset.url} alt="Suggested next frame" />
                <Button
                  disabled={
                    busy ||
                    frames.length >= 6 ||
                    draft.frames.includes(asset.id)
                  }
                  onClick={() => add(asset)}
                >
                  Use suggested frame
                </Button>
              </div>
            ))}
            {[
              "Move closer to the subject, keeping the same setting and visual style.",
              "Show the action beginning, preserving the subject and lighting.",
              "Reveal the final moment, with a clear resting composition.",
            ].map((text) => (
              <Button
                className="text-left"
                disabled={busy}
                key={text}
                onClick={() => {
                  setDraft({ ...draft, framePrompt: text });
                  if (frames.at(-1)) setReference(frames.at(-1)!.id);
                }}
              >
                {text}
              </Button>
            ))}
          </Panel>
        </div>
      )}
      {step === 3 && (
        <Panel>
          <h2>Bring your keyframes to life</h2>
          <p>{draft.prompt}</p>
          <div className="keyframe-grid">
            {frames.map((a, i) => (
              <div className="keyframe-card" key={draft.frames[i]}>
                {a?.url && (
                  <img src={a.url} alt={`Selected keyframe ${i + 1}`} />
                )}
                <span>{((i * 81) / 16).toFixed(1)}s</span>
              </div>
            ))}
          </div>
          <p>
            {Math.max(0, frames.length - 1)} shots · approximately{" "}
            {((Math.max(0, frames.length - 1) * 81) / 16).toFixed(1)} seconds ·
            480p · silent video
          </p>
          <p>
            Each pair uses one paid video request. Reference images are sent to
            fal for generation. Review{" "}
            <a
              href="https://fal.ai/models/fal-ai/wan-flf2v"
              target="_blank"
              rel="noreferrer"
            >
              current model pricing
            </a>{" "}
            before generating. Joining shots runs in this tab.
          </p>
          <Button
            disabled={!ready || frames.length < 2 || frames.some((a) => !a)}
            onClick={() =>
              void run(async () => {
                const clips: ClipAsset[] = [];
                for (let i = 1; i < frames.length; i++) {
                  if (controller.current?.signal.aborted)
                    throw new Error(
                      "Stopped. Completed shots are in your library.",
                    );
                  clips.push(
                    await generate({
                      kind: "video",
                      prompt: draft.prompt,
                      firstId: frames[i - 1]!.id,
                      lastId: frames[i]!.id,
                    }),
                  );
                }
                await combine(clips);
              })
            }
          >
            Generate video
          </Button>
        </Panel>
      )}
      <div className="video-status" role="status">
        {notice ||
          listing?.reason ||
          "Generated frames and videos are saved privately in your asset library."}
      </div>
      {pending.current && !busy && (
        <Button
          onClick={() =>
            void run(async () => {
              const command = pending.current!;
              const job = await api<GenerationJob>("/generation", command);
              remember(null);
              record(job);
              const asset = await wait(job);
              if (asset.url) add(asset);
              setNotice(
                "Recovered generation saved to your library. Completed shots can be joined below.",
              );
            })
          }
        >
          Retry same generation request
        </Button>
      )}
      {listing?.reason && notice && <p>{listing.reason}</p>}
      {busy && (
        <Button onClick={() => controller.current?.abort()}>
          Stop waiting / cancel export
        </Button>
      )}
      <Panel>
        <div className="flex justify-between gap-3">
          <h2>Recent generations</h2>
          <Button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await load();
                setNotice("Generation history refreshed.");
              })
            }
          >
            Refresh generations
          </Button>
        </div>
        <p>
          Completed shots can be selected in order and joined into one video.
          Interrupted jobs can be checked here without generating again.
        </p>
        <div className="keyframe-grid">
          {listing?.jobs.map((job) => (
            <div key={job.id} className="keyframe-card">
              {job.asset?.url && (
                <img src={job.asset.url} alt="Generated frame" />
              )}
              {job.asset?.media && (
                <video
                  controls
                  preload="metadata"
                  src={job.asset.media.landscape.src}
                />
              )}
              <p className="line-clamp-2">{job.prompt}</p>
              <strong>
                {job.kind} · {job.status}
              </strong>
              {job.message && <p>{job.message}</p>}
              {job.asset?.url && (
                <Button
                  disabled={busy || frames.length >= 6}
                  onClick={() => add(job.asset!)}
                >
                  Use keyframe
                </Button>
              )}
              {job.asset?.media && (
                <Button
                  disabled={busy}
                  aria-pressed={selectedClips.includes(job.id)}
                  onClick={() =>
                    setSelectedClips((old) =>
                      old.includes(job.id)
                        ? old.filter((id) => id !== job.id)
                        : [...old, job.id],
                    )
                  }
                >
                  {selectedClips.includes(job.id)
                    ? `Shot ${selectedClips.indexOf(job.id) + 1} selected`
                    : "Select shot"}
                </Button>
              )}
              {(job.status === "queued" || job.status === "submitting") && (
                <Button
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const updated = await api<GenerationJob>(
                        `/generation/${job.id}`,
                        {},
                      );
                      record(updated);
                      setNotice(
                        updated.status === "ready"
                          ? "Asset saved to your library."
                          : `Generation is ${updated.status}.`,
                      );
                    })
                  }
                >
                  Check status
                </Button>
              )}
            </div>
          ))}
        </div>
        {selectedClips.length > 1 && (
          <Button
            disabled={busy}
            onClick={() =>
              void run(() =>
                combine(
                  selectedClips.map(
                    (id) => listing!.jobs.find((j) => j.id === id)!.asset!,
                  ),
                ),
              )
            }
          >
            Join selected shots
          </Button>
        )}
      </Panel>
    </section>
  );
}
