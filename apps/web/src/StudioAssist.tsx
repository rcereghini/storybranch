import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Story, StoryPage } from "../../../packages/contracts/index";
import type {
  AssistChoice,
  AssistCommand,
  AssistResult,
} from "../../../packages/contracts/assist";
import {
  imageAspects,
  maxReferences,
  type GenerationJob,
  type GenerationListing,
  type ImageCommand,
} from "../../../packages/contracts/generation";
import { assetRef, type ClipAsset } from "../../../packages/contracts/media";
import { connections } from "../../../packages/domain/story-graph";
import { ApiError } from "../../../packages/api-client/index";

type Api = <T>(path: string, body?: unknown) => Promise<T>;
const placeholderText = "What happens here?";

// Up to three pages leading to this one, nearest first, for continuity.
function before(story: Story, pageId: string) {
  const trail: { title: string; text: string }[] = [];
  let current = pageId;
  for (let i = 0; i < 3; i++) {
    const parent = Object.values(story.pages).find(
      (p) =>
        p.id !== current &&
        connections(p).some((edge) => edge.target === current),
    );
    if (!parent || trail.some((t) => t.title === parent.title)) break;
    trail.push({ title: parent.title, text: parent.transcript.slice(0, 2000) });
    current = parent.id;
  }
  return trail;
}
const context = (
  story: Story,
  description: string,
  page: StoryPage,
): Omit<AssistCommand, "idempotencyKey" | "action" | "instruction"> => ({
  story: { title: story.title, description },
  page: {
    title: page.title,
    text: page.transcript === placeholderText ? "" : page.transcript,
    pageType: page.pageType,
    ending: page.kind === "ending",
    outputs: page.choices.map((c) => c.label),
  },
  before: before(story, page.id),
});

const styles = [
  ["tighter", "Tighter"],
  ["more vivid and sensory", "More vivid"],
  ["more suspense", "More suspense"],
  ["lighter, warmer tone", "Lighter tone"],
  ["darker, more serious tone", "Darker tone"],
  ["custom", "Custom…"],
] as const;

type Pending = {
  command: AssistCommand;
  label: string;
};

// AI help for one page's text. Suggestions open over the text field (so the
// panel never shifts) and change nothing until the creator accepts them.
export function PageAssist({
  api,
  story,
  description,
  page,
  reason,
  children,
  onText,
  onChoices,
}: {
  api: Api;
  story: Story;
  description: string;
  page: StoryPage;
  // Why AI help is unavailable, or null when it can be used.
  reason: string | null;
  // The text field the suggestions cover.
  children: ReactNode;
  onText: (text: string) => void;
  onChoices: (choices: AssistChoice[]) => void;
}) {
  const [style, setStyle] = useState<(typeof styles)[number][0]>("tighter");
  const [custom, setCustom] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<AssistResult | null>(null);
  const [error, setError] = useState("");
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  // A different page closes any open suggestion.
  useEffect(() => {
    setAnswer(null);
    setError("");
    setPending(null);
  }, [page.id]);

  const run = async (next: Pending) => {
    setPending(next);
    setBusy(true);
    setAnswer(null);
    setError("");
    try {
      const result = await api<AssistResult>("/assist", next.command);
      if (!alive.current) return;
      setAnswer(result);
      setPending(null);
    } catch (e) {
      if (!alive.current) return;
      // A definite refusal frees the request; an unknown outcome keeps it so
      // Retry reuses the same key.
      if (e instanceof ApiError && e.code !== "UNAVAILABLE") setPending(null);
      setError((e as Error).message);
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const ask = (
    action: AssistCommand["action"],
    label: string,
    instruction?: string,
  ) =>
    void run({
      label,
      command: {
        idempotencyKey: crypto.randomUUID(),
        action,
        ...(instruction ? { instruction } : {}),
        ...context(story, description, page),
      },
    });
  const close = () => {
    setAnswer(null);
    setError("");
    setPending(null);
  };
  const hasText =
    page.transcript.trim() !== "" && page.transcript !== placeholderText;
  const branchable =
    page.kind !== "ending" &&
    ["text", "text-options", "video", "video-options"].includes(page.pageType);
  const open = busy || !!answer || !!error;

  return (
    <div className="assist">
      <div className="assist-field">
        {children}
        {open && (
          <div
            className="assist-overlay"
            role="region"
            aria-label="AI suggestion"
          >
            {busy ? (
              <p className="assist-working" role="status">
                <span className="assist-spark" aria-hidden="true">
                  ✦
                </span>{" "}
                {pending?.label ?? "Writing"}…
              </p>
            ) : error ? (
              <>
                <p className="assist-error">{error}</p>
                <div className="assist-buttons">
                  {pending && (
                    <button
                      className="btn btn-primary btn-small"
                      onClick={() => void run(pending)}
                    >
                      Retry
                    </button>
                  )}
                  <button
                    className="btn btn-secondary btn-small"
                    onClick={close}
                  >
                    Close
                  </button>
                </div>
              </>
            ) : answer?.action === "choices" ? (
              <>
                <p className="assist-heading">Suggested choices</p>
                <ol className="assist-choices">
                  {answer.choices.map((c) => (
                    <li key={c.label}>
                      <strong>{c.label}</strong>
                      <span>
                        → {c.title}: {c.text}
                      </span>
                    </li>
                  ))}
                </ol>
                <div className="assist-buttons">
                  <button
                    className="btn btn-primary btn-small"
                    onClick={() => {
                      onChoices(answer.choices);
                      close();
                    }}
                  >
                    Add these choices
                  </button>
                  <button
                    className="btn btn-secondary btn-small"
                    onClick={close}
                  >
                    Discard
                  </button>
                </div>
              </>
            ) : answer && "text" in answer ? (
              <>
                <p className="assist-heading">Suggested text</p>
                <p className="assist-text">{answer.text}</p>
                <div className="assist-buttons">
                  <button
                    className="btn btn-primary btn-small"
                    onClick={() => {
                      onText(answer.text);
                      close();
                    }}
                  >
                    Use this text
                  </button>
                  <button
                    className="btn btn-secondary btn-small"
                    onClick={close}
                  >
                    Discard
                  </button>
                </div>
              </>
            ) : null}
          </div>
        )}
      </div>
      <div className="assist-bar" role="group" aria-label="AI writing help">
        {reason ? (
          <small className="assist-off">{reason}</small>
        ) : (
          <>
            <button
              className="assist-button"
              disabled={busy}
              onClick={() =>
                ask("write", hasText ? "Writing a new version" : "Writing")
              }
            >
              ✦ {hasText ? "Write again" : "Write it"}
            </button>
            <span className="assist-rewrite">
              <select
                aria-label="Rewrite style"
                value={style}
                disabled={busy || !hasText}
                onChange={(e) => setStyle(e.target.value as typeof style)}
              >
                {styles.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <button
                className="assist-button"
                disabled={
                  busy || !hasText || (style === "custom" && !custom.trim())
                }
                onClick={() =>
                  ask(
                    "rewrite",
                    "Rewriting",
                    style === "custom" ? custom.trim() : style,
                  )
                }
              >
                ✦ Rewrite
              </button>
            </span>
            <button
              className="assist-button"
              disabled={busy || !branchable || page.choices.length >= 17}
              onClick={() => ask("choices", "Thinking of choices")}
            >
              ✦ Suggest choices
            </button>
            {style === "custom" && (
              <input
                className="assist-custom"
                aria-label="How to rewrite"
                placeholder="e.g. from the guard's point of view"
                maxLength={300}
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

const aspectLabels = {
  "16:9": "Landscape",
  "9:16": "Portrait",
  "1:1": "Square",
};

// Generates an image for a page: a prompt drafted from the page (or by AI),
// then the asset generator. The result is attached to the page and saved to
// the creator's assets. Comics pass their own heading and prompt, plus the
// cast, whose reference images keep characters consistent.
export function PageImageDialog({
  api,
  story,
  description,
  page,
  assistReason,
  onAttach,
  onClose,
  heading = "Generate a page image",
  initialPrompt,
  initialAspect = "16:9",
  cast = [],
  initialCast = [],
  placement = "placed on this page",
}: {
  api: Api;
  story: Story;
  description: string;
  page: StoryPage;
  assistReason: string | null;
  onAttach: (asset: ClipAsset) => void;
  onClose: () => void;
  heading?: string;
  initialPrompt?: string;
  initialAspect?: ImageCommand["aspect"];
  // Characters offered as reference images: an asset ID and a name.
  cast?: Array<{ assetId: string; name: string }>;
  initialCast?: string[];
  placement?: string;
}) {
  const [listing, setListing] = useState<GenerationListing | null>(null);
  const [prompt, setPrompt] = useState(
    () =>
      initialPrompt ??
      [
        page.title,
        page.transcript === placeholderText
          ? ""
          : page.transcript.slice(0, 600),
        `From the story "${story.title}". Cinematic illustration, no text.`,
      ]
        .filter(Boolean)
        .join(". "),
  );
  const [references, setReferences] = useState(initialCast);
  // References only steer High quality, so a cast defaults to it.
  const [quality, setQuality] = useState<ImageCommand["quality"]>(
    initialCast.length ? "high" : "draft",
  );
  const [aspect, setAspect] = useState<ImageCommand["aspect"]>(initialAspect);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  // An unanswered request keeps its key so Retry cannot bill twice.
  const pending = useRef<ImageCommand | null>(null);
  const alive = useRef(true);
  const working = useRef(false);
  working.current = busy;
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    alive.current = true;
    api<GenerationListing>("/generation").then(setListing, (e) =>
      setStatus(e.message),
    );
    dialog.current?.querySelector("textarea")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !working.current) onClose();
    };
    addEventListener("keydown", key);
    return () => {
      alive.current = false;
      removeEventListener("keydown", key);
    };
  }, []);

  const draftPrompt = async () => {
    setBusy(true);
    setStatus("Writing a prompt…");
    try {
      const result = await api<AssistResult>("/assist", {
        idempotencyKey: crypto.randomUUID(),
        action: "image-prompt",
        ...context(story, description, page),
      });
      if (alive.current && result.action === "image-prompt") {
        setPrompt(result.prompt);
        setStatus("");
      }
    } catch (e) {
      if (alive.current) setStatus((e as Error).message);
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const generate = async () => {
    setBusy(true);
    setStatus(
      quality === "high"
        ? "Generating a high-quality image (up to a minute)…"
        : "Generating a quick draft…",
    );
    try {
      pending.current ??= {
        idempotencyKey: crypto.randomUUID(),
        kind: "image",
        prompt: prompt.trim(),
        quality,
        aspect,
        ...(quality === "high" && references.length
          ? { referenceIds: references }
          : {}),
      };
      let job = await api<GenerationJob>("/generation", pending.current);
      pending.current = null;
      while (job.status === "queued" || job.status === "submitting") {
        if (!alive.current) return;
        setStatus(
          job.quality === "high"
            ? "Generating a high-quality image (up to a minute)…"
            : "Generating a quick draft…",
        );
        await new Promise((r) => setTimeout(r, 3000));
        if (!alive.current) return;
        job = await api<GenerationJob>(`/generation/${job.id}`, {});
      }
      if (job.status !== "ready" || !job.asset)
        throw new Error(job.message ?? "The image could not be generated.");
      onAttach(job.asset);
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.code !== "UNAVAILABLE")
        pending.current = null;
      if (alive.current) setStatus((e as Error).message);
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={() => !busy && onClose()}>
      <div
        ref={dialog}
        className="modal studio-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="page-image-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="modal-close"
          aria-label="Close"
          disabled={busy}
          onClick={onClose}
        >
          ×
        </button>
        <h2 id="page-image-title">{heading}</h2>
        {listing && !listing.enabled && (
          <p className="studio-dialog-off">{listing.reason}</p>
        )}
        <label>
          Image prompt
          <textarea
            rows={5}
            maxLength={1800}
            value={prompt}
            disabled={busy}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </label>
        {!assistReason && !initialPrompt && (
          <button
            className="assist-button"
            disabled={busy}
            onClick={() => void draftPrompt()}
          >
            ✦ Write the prompt with AI
          </button>
        )}
        <div className="studio-dialog-row">
          <div className="disc-filter" role="group" aria-label="Quality">
            {(
              [
                ["draft", "Quick draft"],
                ["high", "High quality"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                aria-pressed={quality === value}
                disabled={busy}
                onClick={() => setQuality(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="disc-filter" role="group" aria-label="Shape">
            {imageAspects.map((value) => (
              <button
                key={value}
                aria-pressed={aspect === value}
                disabled={busy}
                onClick={() => setAspect(value)}
              >
                {aspectLabels[value]}
              </button>
            ))}
          </div>
        </div>
        {cast.length > 0 && (
          <fieldset className="studio-dialog-cast">
            <legend>
              Characters in this image ({references.length}/{maxReferences})
            </legend>
            <div className="disc-filter" role="group" aria-label="Characters">
              {cast.map((c) => (
                <button
                  key={c.assetId}
                  aria-pressed={references.includes(c.assetId)}
                  disabled={
                    busy ||
                    (!references.includes(c.assetId) &&
                      references.length >= maxReferences)
                  }
                  onClick={() =>
                    setReferences((current) =>
                      current.includes(c.assetId)
                        ? current.filter((id) => id !== c.assetId)
                        : [...current, c.assetId],
                    )
                  }
                >
                  {c.name}
                </button>
              ))}
            </div>
          </fieldset>
        )}
        <small className="studio-dialog-note">
          {quality === "draft"
            ? references.length
              ? "Quick drafts can't follow character references; choose High quality to keep characters consistent."
              : "Quick draft: fast and nearly free."
            : "High quality: about $0.15 per image."}{" "}
          The image is saved to your assets and {placement}.
        </small>
        <p className="studio-dialog-status" role="status">
          {status}
        </p>
        <div className="studio-dialog-actions">
          <button
            className="btn btn-primary"
            disabled={busy || !listing?.enabled || prompt.trim().length < 3}
            onClick={() => void generate()}
          >
            {pending.current ? "Retry the same request" : "Generate image"}
          </button>
          <button
            className="btn btn-secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export const imageRef = (asset: ClipAsset) => assetRef(asset.id);
