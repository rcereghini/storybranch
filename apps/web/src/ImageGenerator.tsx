import { useEffect, useRef, useState } from "react";
import type {
  ClipAsset,
  UploadListing,
} from "../../../packages/contracts/media";
import {
  generationCommand,
  generationLimits,
  imageAspects,
  maxReferences,
  type GenerationCommand,
  type GenerationJob,
  type GenerationListing,
  type ImageCommand,
} from "../../../packages/contracts/generation";
import { ApiError } from "../../../packages/api-client/index";
import "./image-generator.css";

type Api = <T>(path: string, body?: unknown) => Promise<T>;
type Quality = ImageCommand["quality"];
type Aspect = ImageCommand["aspect"];
const aspectLabels: Record<Aspect, string> = {
  "16:9": "Landscape",
  "9:16": "Portrait",
  "1:1": "Square",
};

// AI image generation for the asset library. Each request is billed, so a
// submitted request is remembered (per browser) and resent with the same
// key after a network failure instead of creating a second job.
export function ImageGenerator({
  api,
  uid,
  uploads,
  onAsset,
  onClose,
}: {
  api: Api;
  uid: string;
  uploads: UploadListing | null;
  onAsset: (asset: ClipAsset) => void;
  onClose: () => void;
}) {
  const requestKey = `storybranch-image-request-${uid}`;
  const [listing, setListing] = useState<GenerationListing | null>(null);
  const [prompt, setPrompt] = useState("");
  const [quality, setQuality] = useState<Quality>("draft");
  const [aspect, setAspect] = useState<Aspect>("16:9");
  const [references, setReferences] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const alive = useRef(true);
  const pending = useRef<GenerationCommand | null>(
    (() => {
      try {
        return generationCommand.parse(
          JSON.parse(localStorage.getItem(requestKey) ?? "null"),
        );
      } catch {
        return null;
      }
    })(),
  );
  const remember = (command: GenerationCommand | null) => {
    pending.current = command;
    try {
      if (command) localStorage.setItem(requestKey, JSON.stringify(command));
      else localStorage.removeItem(requestKey);
    } catch {
      // Without storage a retry after reload starts a new request.
    }
  };

  useEffect(() => {
    alive.current = true;
    api<GenerationListing>("/generation")
      .then(setListing)
      .catch((e) => setNotice(e.message));
    return () => {
      alive.current = false;
    };
  }, []);

  const record = (job: GenerationJob) => {
    setListing((old) =>
      old
        ? { ...old, jobs: [job, ...old.jobs.filter((j) => j.id !== job.id)] }
        : old,
    );
    if (job.asset) onAsset(job.asset);
  };
  const progress = (quality: Quality | undefined) =>
    setNotice(
      quality === "high"
        ? "Generating a high-quality image. This can take up to a minute…"
        : "Generating a quick draft…",
    );
  const wait = async (job: GenerationJob) => {
    while (job.status === "queued" || job.status === "submitting") {
      if (!alive.current) return;
      progress(job.quality);
      await new Promise((resolve) => setTimeout(resolve, 3000));
      if (!alive.current) return;
      job = await api<GenerationJob>(`/generation/${job.id}`, {});
      record(job);
    }
    if (job.status !== "ready" || !job.asset)
      throw new Error(
        job.message ??
          "The result needs checking in your OpenAI usage before retrying.",
      );
    setNotice("Saved to your assets.");
  };
  const generate = async () => {
    setBusy(true);
    setNotice("");
    try {
      if (!pending.current)
        remember({
          idempotencyKey: crypto.randomUUID(),
          kind: "image",
          prompt: prompt.trim(),
          quality,
          aspect,
          ...(quality === "high" && references.length
            ? { referenceIds: references }
            : {}),
        });
      // The server answers once the image is made.
      progress(quality);
      const job = await api<GenerationJob>("/generation", pending.current);
      remember(null);
      record(job);
      await wait(job);
    } catch (error) {
      // A definite refusal frees the request; an unknown outcome keeps it
      // so the retry reuses the same key.
      if (error instanceof ApiError && error.code !== "UNAVAILABLE")
        remember(null);
      setNotice((error as Error).message);
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const check = async (job: GenerationJob) => {
    setBusy(true);
    try {
      await wait(job);
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  const images = (uploads?.items ?? []).filter(
    (a) => a.status === "ready" && a.url,
  );
  const toggle = (assetId: string) =>
    setReferences((current) =>
      current.includes(assetId)
        ? current.filter((id) => id !== assetId)
        : current.length < maxReferences
          ? [...current, assetId]
          : current,
    );
  const ready = !!listing?.enabled && !busy && prompt.trim().length >= 3;
  const jobs = (listing?.jobs ?? []).filter((job) => job.kind === "image");

  return (
    <section className="imagegen" aria-labelledby="imagegen-title">
      <div className="imagegen-head">
        <div>
          <button className="btn-link" onClick={onClose}>
            ← Assets
          </button>
          <h1 id="imagegen-title">Generate an image</h1>
          <p className="imagegen-muted">
            Describe the scene. Results are saved to your assets, ready to use
            on any StoryNode.
          </p>
        </div>
      </div>
      {listing && !listing.enabled && (
        <p className="imagegen-off">{listing.reason}</p>
      )}
      <div className="imagegen-layout">
        <form
          className="imagegen-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (ready || pending.current) void generate();
          }}
        >
          <label className="imagegen-field">
            <span>Prompt</span>
            <textarea
              rows={5}
              maxLength={1800}
              value={prompt}
              placeholder="A rain-slicked harbor at night, a courier in a navy oilskin coat waiting under a broken lighthouse…"
              onChange={(e) => setPrompt(e.target.value)}
            />
          </label>
          <fieldset className="imagegen-field">
            <legend>Quality</legend>
            <div className="disc-filter" role="group" aria-label="Quality">
              {(
                [
                  ["draft", "Quick draft"],
                  ["high", "High quality"],
                ] as const
              ).map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  aria-pressed={quality === value}
                  onClick={() => setQuality(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <small>
              {quality === "draft"
                ? "Fast and nearly free. Good for exploring ideas."
                : "Best detail, about $0.15 per image, and can follow reference images."}
            </small>
          </fieldset>
          <fieldset className="imagegen-field">
            <legend>Shape</legend>
            <div className="disc-filter" role="group" aria-label="Shape">
              {imageAspects.map((value) => (
                <button
                  type="button"
                  key={value}
                  aria-pressed={aspect === value}
                  onClick={() => setAspect(value)}
                >
                  {aspectLabels[value]}
                </button>
              ))}
            </div>
          </fieldset>
          {quality === "high" && (
            <fieldset className="imagegen-field">
              <legend>
                Reference images{" "}
                <span className="imagegen-muted">
                  ({references.length}/{maxReferences}, optional)
                </span>
              </legend>
              {images.length === 0 ? (
                <small>
                  Upload or generate an image first; it can then keep a
                  character or place consistent.
                </small>
              ) : (
                <div className="imagegen-refs">
                  {images.map((asset) => (
                    <button
                      type="button"
                      key={asset.id}
                      aria-pressed={references.includes(asset.id)}
                      aria-label={`Use ${asset.fileName} as a reference`}
                      disabled={
                        !references.includes(asset.id) &&
                        references.length >= maxReferences
                      }
                      onClick={() => toggle(asset.id)}
                    >
                      <img src={asset.url} alt="" loading="lazy" />
                    </button>
                  ))}
                </div>
              )}
            </fieldset>
          )}
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!ready && !pending.current}
          >
            {pending.current ? "Retry the same request" : "Generate image"}
          </button>
          {/* Reserved line: progress and errors never shift the form. */}
          <p className="imagegen-status" role="status">
            {notice}
          </p>
          <small className="imagegen-muted">
            {listing && listing.highQualityWeight > 1
              ? `A daily allowance of ${listing.daily}: a draft uses 1 and high quality uses ${listing.highQualityWeight}.`
              : `Up to ${listing?.daily ?? generationLimits.daily} generations a day.`} Prompts and
            reference images are sent to OpenAI to create the image.
          </small>
        </form>
        <div className="imagegen-results" aria-labelledby="imagegen-recent">
          <h2 id="imagegen-recent">Recent generations</h2>
          {!listing ? (
            <div className="placeholder-block tall" aria-hidden="true" />
          ) : jobs.length === 0 ? (
            <p className="imagegen-muted">Your generated images appear here.</p>
          ) : (
            <ul>
              {jobs.map((job) => (
                <li key={job.id} className="imagegen-job">
                  {job.asset?.url ? (
                    <img src={job.asset.url} alt={job.prompt} loading="lazy" />
                  ) : (
                    <span className="imagegen-job-state">
                      {job.status === "failed"
                        ? "Failed"
                        : job.status === "uncertain"
                          ? "Check needed"
                          : "Working…"}
                    </span>
                  )}
                  <div>
                    <p>{job.prompt}</p>
                    <small>
                      {job.quality === "high" ? "High quality" : "Quick draft"}
                      {job.aspect ? ` · ${aspectLabels[job.aspect]}` : ""}
                      {" · "}
                      {new Date(job.createdAt).toLocaleString()}
                    </small>
                    {job.message && <small>{job.message}</small>}
                    {job.status === "queued" && (
                      <button
                        className="btn-link"
                        disabled={busy}
                        onClick={() => void check(job)}
                      >
                        Check status
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
