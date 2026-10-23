import { useEffect, useRef, useState } from "react";
import type { StoryPage } from "../../../packages/contracts/index";
import { comicLimits } from "../../../packages/contracts/index";
import type { DraftRecord } from "../../../packages/contracts/authoring";
import type {
  AssistResult,
  ComicBrief,
  ComicScript,
} from "../../../packages/contracts/assist";
import type {
  GenerationListing,
  ImageCommand,
} from "../../../packages/contracts/generation";
import {
  assetIdOf,
  assetRef,
  uploadLimits,
  type ClipAsset,
  type UploadListing,
} from "../../../packages/contracts/media";
import { ApiError } from "../../../packages/api-client/index";
import { generateImage } from "./StudioAssist";
import {
  applyComicScript,
  castInPanel,
  castPrompt,
  comicStyles,
  drawPlan,
  panelPrompt,
} from "./studio-model";

type Api = <T>(path: string, body?: unknown) => Promise<T>;
type Edit = (update: (d: DraftRecord) => DraftRecord) => void;
type Shape = "grid-4" | "grid-9" | "scroll";
type Job = {
  key: string;
  kind: "cast" | "panel";
  targetId: string;
  label: string;
  status: "waiting" | "drawing" | "done" | "failed";
  message?: string;
  url?: string;
  // Kept after an unanswered request so Retry reuses its key.
  command?: ImageCommand;
};
const revisions = [
  ["Make it funnier", "make it funnier"],
  ["Sharper punchline", "give it a sharper, more surprising punchline"],
  ["Shorter captions", "make the captions shorter and punchier"],
  ["More absurd", "make it more absurd"],
] as const;
// High quality is the tier that follows character references.
const costPerImage = 0.15;
const parallel = 3;

const shapeOf = (page: StoryPage): Shape =>
  page.comic?.layout === "scroll"
    ? "scroll"
    : page.comic?.panels.length === 9
      ? "grid-9"
      : "grid-4";

// Sets a drawn image on its panel or character, only in the draft it was
// drawn for: the creator may have opened another draft meanwhile.
function placeImage(
  d: DraftRecord,
  storyId: string,
  pageId: string,
  job: Job,
  image: string,
): DraftRecord {
  if (d.story.id !== storyId) return d;
  if (job.kind === "cast")
    return d.comic
      ? {
          ...d,
          comic: {
            ...d.comic,
            cast: d.comic.cast.map((c) =>
              c.id === job.targetId ? { ...c, image } : c,
            ),
          },
        }
      : d;
  const page = d.story.pages[pageId];
  if (!page?.comic) return d;
  return {
    ...d,
    story: {
      ...d.story,
      pages: {
        ...d.story.pages,
        [pageId]: {
          ...page,
          comic: {
            ...page.comic,
            panels: page.comic.panels.map((p) =>
              p.id === job.targetId ? { ...p, image } : p,
            ),
          },
        },
      },
    },
  };
}

// The comic companion: the creator describes the situation and the joke and
// picks a style; Claude writes a script to review and revise (cheap), and
// only then are the character sheets and panels drawn (the costly part).
// Everything lands in the draft through Studio's normal edit, so it saves,
// undoes and publishes like a hand-made comic.
export function ComicCompanion({
  api,
  draft,
  page,
  uploads,
  assistReason,
  onEdit,
  onUploaded,
  onClose,
}: {
  api: Api;
  draft: DraftRecord;
  page: StoryPage;
  uploads: UploadListing | null;
  assistReason: string | null;
  onEdit: Edit;
  onUploaded: (asset: ClipAsset) => void;
  onClose: () => void;
}) {
  const storyId = draft.story.id;
  const [step, setStep] = useState<"brief" | "script" | "draw">("brief");
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
  const [shape, setShape] = useState<Shape>(() => shapeOf(page));
  const [stripCount, setStripCount] = useState(() =>
    page.comic?.layout === "scroll" ? page.comic.panels.length : 6,
  );
  const [script, setScript] = useState<ComicScript | null>(null);
  const [change, setChange] = useState("");
  const [listing, setListing] = useState<GenerationListing | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
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
  const hasArt = !!page.comic?.panels.some((p) => p.image);

  const write = async (revision?: string) => {
    setBusy(true);
    setStatus(revision ? "Revising the script…" : "Writing the script…");
    const body = {
      action: "comic-script",
      ...(revision ? { instruction: revision } : {}),
      story: { title: draft.story.title, description: draft.description },
      page: {
        title: page.title,
        text: "",
        pageType: "comic",
        ending: page.kind === "ending",
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
          ? applyComicScript(d, page.id, script, brief())
          : d;
      return applied;
    });
    return applied as DraftRecord | null;
  };

  const update = (key: string, patch: Partial<Job>) =>
    alive.current &&
    setJobs((all) => all.map((j) => (j.key === key ? { ...j, ...patch } : j)));

  // Draws one job. The draft it reads is the latest one, so panels drawn
  // after the character sheets use their reference images.
  const latest = useRef(draft);
  latest.current = draft;
  const sheets = useRef(new Map<string, string>());
  const drawOne = async (job: Job, current: DraftRecord) => {
    const studio = current.comic ?? { style: "", cast: [] };
    const comic = current.story.pages[page.id]?.comic;
    const cast = studio.cast.map((c) => {
      const image = c.image ?? sheets.current.get(c.id);
      return image ? { ...c, image } : c;
    });
    let command = job.command;
    if (!command) {
      let prompt = "";
      let referenceIds: string[] = [];
      if (job.kind === "cast") {
        const member = cast.find((c) => c.id === job.targetId);
        if (!member)
          return update(job.key, { status: "failed", message: "Removed" });
        prompt = castPrompt(member, studio.style);
      } else {
        const index = comic?.panels.findIndex((p) => p.id === job.targetId);
        if (!comic || index === undefined || index < 0)
          return update(job.key, { status: "failed", message: "Removed" });
        const inPanel = castInPanel(cast, comic.panels[index]);
        prompt = panelPrompt(comic, index, studio.style, inPanel);
        referenceIds = inPanel.map((c) => assetIdOf(c.image)!);
      }
      command = {
        idempotencyKey: crypto.randomUUID(),
        kind: "image",
        prompt,
        quality: "high",
        aspect: "1:1",
        ...(referenceIds.length ? { referenceIds } : {}),
      };
    }
    update(job.key, {
      status: "drawing",
      message: undefined,
      command,
    });
    try {
      const asset = await generateImage(api, command);
      if (!asset) return;
      const image = assetRef(asset.id);
      if (job.kind === "cast") sheets.current.set(job.targetId, image);
      onUploaded(asset);
      onEdit((d) => placeImage(d, storyId, page.id, job, image));
      update(job.key, {
        status: "done",
        url: asset.url,
        command: undefined,
      });
    } catch (e) {
      update(job.key, {
        status: "failed",
        message: (e as Error).message,
        // Only an unanswered request keeps its key for Retry.
        command:
          e instanceof ApiError && e.code !== "UNAVAILABLE"
            ? undefined
            : command,
      });
    }
  };
  const runAll = async (list: Job[], current: DraftRecord) => {
    setBusy(true);
    setStatus("");
    // Character sheets first, so every panel can follow them.
    for (const kind of ["cast", "panel"] as const) {
      const queue = list.filter((j) => j.kind === kind);
      await Promise.all(
        Array.from({ length: Math.min(parallel, queue.length) }, async () => {
          for (let job = queue.shift(); job; job = queue.shift())
            await drawOne(job, kind === "cast" ? current : latest.current);
        }),
      );
    }
    if (alive.current) setBusy(false);
  };
  const draw = () => {
    const current = applyScript();
    if (!current) return;
    const plan = drawPlan(current, page.id);
    const list: Job[] = [
      ...plan.cast.map((c) => ({
        key: `cast-${c.id}`,
        kind: "cast" as const,
        targetId: c.id,
        label: c.name,
        status: "waiting" as const,
      })),
      ...plan.panels.map((p) => ({
        key: `panel-${p.id}`,
        kind: "panel" as const,
        targetId: p.id,
        label: `Panel ${current.story.pages[page.id].comic!.panels.indexOf(p) + 1}`,
        status: "waiting" as const,
      })),
    ];
    setJobs(list);
    setStep("draw");
    void runAll(list, current);
  };
  const retry = () => {
    const failed = jobs.filter((j) => j.status === "failed");
    setJobs((all) =>
      all.map((j) =>
        j.status === "failed"
          ? { ...j, status: "waiting", message: undefined }
          : j,
      ),
    );
    void runAll(failed, latest.current);
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
  const done = jobs.filter((j) => j.status === "done").length;
  const failed = jobs.filter((j) => j.status === "failed").length;
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
              {status || short}
            </p>
            <div className="studio-dialog-actions">
              <button
                className="btn btn-primary"
                disabled={busy || !!short}
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
              Each image fills into your comic as soon as it's ready. Keep this
              open until drawing finishes.
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
                    <strong>
                      {j.kind === "cast" ? `${j.label} (character)` : j.label}
                    </strong>
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
              {busy
                ? `Drawing… ${done} of ${jobs.length} done`
                : failed
                  ? `${done} of ${jobs.length} drawn. ${failed} could not be drawn; change their description in the panel settings, or retry.`
                  : "Your comic is drawn. Redraw any panel from its settings."}
            </p>
            <div className="studio-dialog-actions">
              {!busy && failed > 0 && (
                <button className="btn btn-primary" onClick={retry}>
                  Retry {failed === 1 ? "it" : `all ${failed}`}
                </button>
              )}
              <button
                className={failed ? "btn btn-secondary" : "btn btn-primary"}
                disabled={busy}
                onClick={onClose}
              >
                {failed ? "Close" : "See my comic"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
