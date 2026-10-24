import { useEffect, useRef, useState } from "react";
import type { StoryNode } from "../../../packages/contracts/index";
import { comicLimits } from "../../../packages/contracts/index";
import type { DraftRecord } from "../../../packages/contracts/authoring";
import type {
  AssistResult,
  ComicBrief,
  ComicScript,
} from "../../../packages/contracts/assist";
import type { GenerationListing } from "../../../packages/contracts/generation";
import {
  uploadLimits,
  type UploadListing,
} from "../../../packages/contracts/media";
import { ApiError } from "../../../packages/api-client/index";
import {
  type Drawing,
  askToNotify,
  costPerImage,
  counts,
  dismissDrawing,
  retryDrawing,
  startDrawing,
  useDrawing,
} from "./comic-drawing";
import { applyComicScript, comicStyles } from "./studio-model";

type Api = <T>(path: string, body?: unknown) => Promise<T>;
type Edit = (update: (d: DraftRecord) => DraftRecord) => void;
type Shape = "grid-4" | "grid-9" | "scroll";
const revisions = [
  ["Make it funnier", "make it funnier"],
  ["Sharper punchline", "give it a sharper, more surprising punchline"],
  ["Shorter captions", "make the captions shorter and punchier"],
  ["More absurd", "make it more absurd"],
] as const;
const shapeOf = (storyNode: StoryNode): Shape =>
  storyNode.comic?.layout === "scroll"
    ? "scroll"
    : storyNode.comic?.panels.length === 9
      ? "grid-9"
      : "grid-4";

// The comic companion: the creator describes the situation and the joke and
// picks a style; Claude writes a script to review and revise (cheap), and
// only then are the character sheets and panels drawn (the costly part).
// Everything lands in the draft through Studio's normal edit, so it saves,
// undoes and publishes like a hand-made comic. Drawing runs in the
// background (comic-drawing.ts): the dialog closes, and reopening it shows
// the progress.
export function ComicCompanion({
  api,
  draft,
  storyNode,
  uploads,
  assistReason,
  onEdit,
  onClose,
}: {
  api: Api;
  draft: DraftRecord;
  storyNode: StoryNode;
  uploads: UploadListing | null;
  assistReason: string | null;
  onEdit: Edit;
  onClose: () => void;
}) {
  const storyId = draft.story.id;
  const drawing = useDrawing();
  const mine =
    drawing?.storyId === storyId && drawing.storyNodeId === storyNode.id
      ? drawing
      : null;
  const [step, setStep] = useState<"brief" | "script" | "draw">(() =>
    mine ? "draw" : "brief",
  );
  const [premise, setPremise] = useState("");
  // A preset's index, or -1 for the creator's own description.
  const [style, setStyle] = useState(() =>
    draft.comic?.style.trim()
      ? comicStyles.findIndex(([, prompt]) => prompt === draft.comic?.style)
      : 0,
  );
  const [customStyle, setCustomStyle] = useState(() =>
    draft.comic?.style && !comicStyles.some(([, p]) => p === draft.comic?.style)
      ? draft.comic.style
      : "",
  );
  const [shape, setShape] = useState<Shape>(() => shapeOf(storyNode));
  const [stripCount, setStripCount] = useState(() =>
    storyNode.comic?.layout === "scroll" ? storyNode.comic.panels.length : 6,
  );
  const [script, setScript] = useState<ComicScript | null>(null);
  const [change, setChange] = useState("");
  const [listing, setListing] = useState<GenerationListing | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const alive = useRef(true);
  const working = useRef(false);
  working.current = busy;
  const dialog = useRef<HTMLDivElement>(null);
  // An unanswered script request, so Retry reuses its key.
  const pendingScript = useRef<{ key: string; body: string } | null>(null);
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

  const styleText = style < 0 ? customStyle.trim() : comicStyles[style][1];
  const brief = (): ComicBrief => ({
    premise: premise.trim(),
    style: styleText,
    layout: shape === "scroll" ? "scroll" : "grid",
    panelCount: shape === "grid-4" ? 4 : shape === "grid-9" ? 9 : stripCount,
  });
  const hasArt = !!storyNode.comic?.panels.some((p) => p.image);

  const write = async (revision?: string) => {
    setBusy(true);
    setStatus(revision ? "Revising the script…" : "Writing the script…");
    const body = {
      action: "comic-script",
      ...(revision ? { instruction: revision } : {}),
      story: { title: draft.story.title, description: draft.description },
      storyNode: {
        title: storyNode.title,
        text: "",
        storyNodeType: "comic",
        ending: storyNode.kind === "ending",
        outputs: [],
      },
      before: [],
      comic: { ...brief(), ...(revision && script ? { script } : {}) },
    };
    // Retrying the same request reuses its key; a changed one gets a new key.
    if (pendingScript.current?.body !== JSON.stringify(body))
      pendingScript.current = {
        key: crypto.randomUUID(),
        body: JSON.stringify(body),
      };
    try {
      const result = await api<AssistResult>("/assist", {
        idempotencyKey: pendingScript.current.key,
        ...body,
      });
      pendingScript.current = null;
      if (!alive.current || result.action !== "comic-script") return;
      setScript(result.script);
      setChange("");
      setStep("script");
      setStatus("");
    } catch (e) {
      // A definite refusal frees the request; an unknown outcome keeps it.
      if (e instanceof ApiError && e.code !== "UNAVAILABLE")
        pendingScript.current = null;
      if (alive.current) setStatus((e as Error).message);
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  // Puts the script into the draft and returns the draft as it now stands.
  const applyScript = () => {
    if (!script) return null;
    let applied: DraftRecord | null = null;
    onEdit((d) => {
      applied =
        d.story.id === storyId
          ? applyComicScript(d, storyNode.id, script, brief())
          : d;
      return applied;
    });
    return applied as DraftRecord | null;
  };

  const draw = () => {
    askToNotify();
    const current = applyScript();
    if (!current) return;
    startDrawing(
      api,
      current,
      storyNode.id,
      script?.title || current.story.title,
    );
    onClose();
  };

  // What drawing will take, against today's generations and library room.
  const castNeeding = script
    ? script.cast.filter(
        (c) =>
          !draft.comic?.cast.some(
            (p) =>
              p.image && p.name.trim().toLowerCase() === c.name.toLowerCase(),
          ),
      ).length
    : 0;
  const needed = castNeeding + (script?.panels.length ?? 0);
  const libraryRoom = uploads
    ? uploadLimits.maxAssets - uploads.items.length
    : Infinity;
  const short = !listing?.enabled
    ? (listing?.reason ?? "Checking image generation…")
    : needed > (listing?.remaining ?? 0)
      ? `Drawing needs ${needed} images and you have ${listing.remaining} generations left today.`
      : needed > libraryRoom
        ? `Drawing needs ${needed} images and your asset library has room for ${libraryRoom}.`
        : null;
  const { done, failed } = mine ? counts(mine) : { done: 0, failed: 0 };
  const jobs = mine?.jobs ?? [];
  const elsewhere = drawing?.running && !mine;
  const editScript = (update: (s: ComicScript) => ComicScript) =>
    setScript((s) => (s ? update(s) : s));

  return (
    <div className="modal-backdrop" onClick={() => !busy && onClose()}>
      <div
        ref={dialog}
        className="modal studio-dialog comic-companion"
        role="dialog"
        aria-modal="true"
        aria-labelledby="comic-companion-title"
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
        <h2 id="comic-companion-title">
          {step === "brief"
            ? "Make a comic with AI"
            : step === "script"
              ? "Your script"
              : "Drawing your comic"}
        </h2>
        {assistReason && <p className="studio-dialog-off">{assistReason}</p>}

        {step === "brief" && (
          <>
            <label>
              What's the situation, and what's the joke?
              <textarea
                rows={4}
                maxLength={800}
                value={premise}
                disabled={busy}
                placeholder="My cat knocks things off the table while staring at me. Punchline: he does it to my phone in the middle of a work call."
                onChange={(e) => setPremise(e.target.value)}
              />
            </label>
            <fieldset className="studio-dialog-cast">
              <legend>Style</legend>
              <div className="disc-filter" role="group" aria-label="Style">
                {comicStyles.map(([label], i) => (
                  <button
                    key={label}
                    aria-pressed={style === i}
                    disabled={busy}
                    onClick={() => setStyle(i)}
                  >
                    {label}
                  </button>
                ))}
                <button
                  aria-pressed={style < 0}
                  disabled={busy}
                  onClick={() => setStyle(-1)}
                >
                  Other…
                </button>
              </div>
            </fieldset>
            {style < 0 && (
              <label>
                Describe the style
                <textarea
                  rows={2}
                  maxLength={300}
                  value={customStyle}
                  disabled={busy}
                  placeholder="Crayon drawing by a five-year-old, wobbly lines"
                  onChange={(e) => setCustomStyle(e.target.value)}
                />
              </label>
            )}
            <fieldset className="studio-dialog-cast">
              <legend>Layout</legend>
              <div className="disc-filter" role="group" aria-label="Layout">
                {(
                  [
                    ["grid-4", "Square · 4 panels"],
                    ["grid-9", "Square · 9 panels"],
                    ["scroll", "Scrolling strip"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    aria-pressed={shape === value}
                    disabled={busy}
                    onClick={() => setShape(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>
            {shape === "scroll" && (
              <label className="comic-companion-count">
                Panels
                <select
                  value={stripCount}
                  disabled={busy}
                  onChange={(e) => setStripCount(Number(e.target.value))}
                >
                  {Array.from(
                    {
                      length: comicLimits.scroll[1] - comicLimits.scroll[0] + 1,
                    },
                    (_, i) => comicLimits.scroll[0] + i,
                  ).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <small className="studio-dialog-note">
              Claude writes the script first. Nothing is drawn until you approve
              it.
            </small>
            <p className="studio-dialog-status" role="status">
              {status}
            </p>
            <div className="studio-dialog-actions">
              <button
                className="btn btn-primary"
                disabled={
                  busy ||
                  !!assistReason ||
                  premise.trim().length < 10 ||
                  (style < 0 && !customStyle.trim())
                }
                onClick={() => void write()}
              >
                {pendingScript.current ? "Retry" : "✦ Write the script"}
              </button>
              {script && (
                <button
                  className="btn btn-secondary"
                  disabled={busy}
                  onClick={() => setStep("script")}
                >
                  Back to the script
                </button>
              )}
            </div>
          </>
        )}

        {step === "script" && script && (
          <>
            <label>
              Title
              <input
                maxLength={160}
                value={script.title}
                disabled={busy}
                onChange={(e) =>
                  editScript((s) => ({ ...s, title: e.target.value }))
                }
              />
            </label>
            {script.cast.length > 0 && (
              <>
                <h3>Cast</h3>
                <ul className="comic-companion-list">
                  {script.cast.map((c, i) => (
                    <li key={i}>
                      <strong>{c.name}</strong>
                      <textarea
                        rows={2}
                        maxLength={400}
                        aria-label={`What ${c.name} looks like`}
                        value={c.description}
                        disabled={busy}
                        onChange={(e) =>
                          editScript((s) => ({
                            ...s,
                            cast: s.cast.map((x, j) =>
                              j === i
                                ? { ...x, description: e.target.value }
                                : x,
                            ),
                          }))
                        }
                      />
                    </li>
                  ))}
                </ul>
              </>
            )}
            <h3>Panels</h3>
            <ol className="comic-companion-list">
              {script.panels.map((p, i) => (
                <li key={i}>
                  <strong>Panel {i + 1}</strong>
                  <textarea
                    rows={2}
                    maxLength={400}
                    aria-label={`Panel ${i + 1} picture`}
                    value={p.alt}
                    disabled={busy}
                    onChange={(e) =>
                      editScript((s) => ({
                        ...s,
                        panels: s.panels.map((x, j) =>
                          j === i ? { ...x, alt: e.target.value } : x,
                        ),
                      }))
                    }
                  />
                  <input
                    maxLength={200}
                    aria-label={`Panel ${i + 1} caption`}
                    placeholder="No caption"
                    value={p.caption}
                    disabled={busy}
                    onChange={(e) =>
                      editScript((s) => ({
                        ...s,
                        panels: s.panels.map((x, j) =>
                          j === i ? { ...x, caption: e.target.value } : x,
                        ),
                      }))
                    }
                  />
                </li>
              ))}
            </ol>
            <fieldset className="studio-dialog-cast">
              <legend>Change it</legend>
              <div className="disc-filter" role="group" aria-label="Revise">
                {revisions.map(([label, instruction]) => (
                  <button
                    key={label}
                    disabled={busy || !!assistReason}
                    onClick={() => void write(instruction)}
                  >
                    ✦ {label}
                  </button>
                ))}
              </div>
              <div className="comic-companion-change">
                <input
                  aria-label="What to change"
                  maxLength={300}
                  placeholder="Or say what to change: the dog should be the villain"
                  value={change}
                  disabled={busy}
                  onChange={(e) => setChange(e.target.value)}
                />
                <button
                  className="assist-button"
                  disabled={busy || !!assistReason || !change.trim()}
                  onClick={() => void write(change.trim())}
                >
                  ✦ Revise
                </button>
              </div>
            </fieldset>
            <small className="studio-dialog-note">
              Drawing makes {needed} high-quality images
              {castNeeding
                ? ` (${castNeeding} character sheet${castNeeding === 1 ? "" : "s"}, then ${script.panels.length} panels)`
                : ""}
              , about ${(needed * costPerImage).toFixed(2)}.
              {listing?.enabled &&
                ` You have ${listing.remaining} generations left today.`}
              {hasArt && " This replaces the comic's current panels."}
            </small>
            <p className="studio-dialog-status" role="status">
              {status ||
                short ||
                (elsewhere
                  ? `Another comic, ${drawing.title}, is still drawing.`
                  : "")}
            </p>
            <div className="studio-dialog-actions">
              <button
                className="btn btn-primary"
                disabled={busy || !!short || !!elsewhere}
                onClick={draw}
              >
                ✦ Draw it
              </button>
              <button
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => {
                  applyScript();
                  onClose();
                }}
              >
                Use the script only
              </button>
              <button
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => setStep("brief")}
              >
                Back
              </button>
            </div>
          </>
        )}

        {step === "draw" && (
          <>
            <p className="muted">
              Each image fills into your comic as soon as it's ready. You can
              close this and keep working; you'll get a notification when it's
              done.
            </p>
            <ul className="comic-companion-jobs">
              {jobs.map((j) => (
                <li key={j.key} data-status={j.status}>
                  {j.url ? (
                    <img src={j.url} alt="" />
                  ) : (
                    <span className="comic-empty" aria-hidden="true" />
                  )}
                  <span>
                    <strong>{j.label}</strong>
                    <small>
                      {j.status === "waiting"
                        ? "Waiting"
                        : j.status === "drawing"
                          ? "Drawing…"
                          : j.status === "done"
                            ? "Done"
                            : j.message}
                    </small>
                  </span>
                </li>
              ))}
            </ul>
            <p className="studio-dialog-status" role="status">
              {mine?.running
                ? `Drawing… ${done} of ${jobs.length} done`
                : failed
                  ? `${done} of ${jobs.length} drawn. ${failed} could not be drawn; change their description in the panel settings, or retry.`
                  : "Your comic is drawn. Redraw any panel from its settings."}
            </p>
            <div className="studio-dialog-actions">
              {mine?.running ? (
                <button className="btn btn-primary" onClick={onClose}>
                  Keep drawing in the background
                </button>
              ) : (
                <>
                  {failed > 0 && (
                    <button
                      className="btn btn-primary"
                      onClick={() => retryDrawing(api, draft)}
                    >
                      Retry {failed === 1 ? "it" : `all ${failed}`}
                    </button>
                  )}
                  <button
                    className={failed ? "btn btn-secondary" : "btn btn-primary"}
                    onClick={() => {
                      dismissDrawing();
                      onClose();
                    }}
                  >
                    {failed ? "Done" : "See my comic"}
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// A fixed status pill for a background drawing: progress while it runs, the
// result when it finishes. It never moves the editor's layout. View reopens
// the companion on the comic.
export function DrawingStatus({
  drawing,
  onView,
}: {
  drawing: Drawing | null;
  onView: (drawing: Drawing) => void;
}) {
  if (!drawing) return null;
  const { done, failed } = counts(drawing);
  const total = drawing.jobs.length;
  return (
    <div className="comic-drawing-status" role="status">
      <span className="comic-drawing-mark" aria-hidden="true">
        {drawing.running ? "✦" : failed ? "!" : "✓"}
      </span>
      <span>
        <strong>{drawing.title}</strong>
        <small>
          {drawing.running
            ? `Drawing… ${done} of ${total} done`
            : failed
              ? `${done} of ${total} drawn · ${failed} need another try`
              : `Drawn · all ${total} images are in`}
        </small>
      </span>
      <button
        className="btn btn-secondary btn-small"
        onClick={() => onView(drawing)}
      >
        View
      </button>
      {!drawing.running && (
        <button
          className="comic-drawing-dismiss"
          aria-label="Dismiss"
          onClick={dismissDrawing}
        >
          ×
        </button>
      )}
    </div>
  );
}
