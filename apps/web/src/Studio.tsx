import { Button } from "./ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { createApi, ApiError } from "../../../packages/api-client/index";
import { z } from "zod";
import { choiceSchema, effectSchema } from "../../../packages/contracts/index";
import { auth } from "./firebase";
import {
  type Choice,
  type Story as StoryData,
  type StoryPage,
  type Save,
} from "../../../packages/contracts/index";
import { type DraftRecord } from "../../../packages/contracts/authoring";
import type { AssistChoice } from "../../../packages/contracts/assist";
import { validatePublication } from "../../../packages/domain/authoring";
import {
  baseStats,
  isResultPage,
  start,
  transition,
} from "../../../packages/domain/index";
import { resolveFixtureMedia } from "../../../fixtures/media";
import { Story } from "./Story";
import { Page } from "./Page";
import { ClipPicker } from "./ClipPicker";
import { PageLibrary } from "./Library";
import { StoryGraph } from "./StoryGraph";
import { StoryOutline } from "./StoryOutline";
import { PageAssist, PageImageDialog } from "./StudioAssist";
import { ComicEditor, ComicWorkspace, panelImages } from "./ComicEditor";
import { DrawingStatus } from "./ComicCompanion";
import {
  placeImage,
  setPlacer,
  useDrawing,
  withDrawnImages,
  type Drawing,
  type Placer,
} from "./comic-drawing";
import { connectPage } from "../../../packages/domain/story-graph";
import {
  assetIdOf,
  assetRef,
  type ClipAsset,
  type UploadListing,
} from "../../../packages/contracts/media";
import {
  blankStory,
  choice,
  comicTemplate,
  countToward,
  ending,
  makePage,
  media,
  newComic,
  quizTemplate,
  result,
  revealChoice,
  route,
  scoreOf,
  shortId,
} from "./studio-model";
import "./studio.css";

const api = createApi(
  fetch,
  async () => auth.currentUser?.getIdToken() ?? null,
);
type Listing = {
  items: {
    id: string;
    title: string;
    revision: number;
    publishedVersionId: string | null;
  }[];
  nextCursor: string | null;
  canPublish: boolean;
};
// What undo restores: everything the creator edits in a draft.
type Snapshot = Pick<
  DraftRecord,
  "story" | "description" | "pagePositions" | "comic"
>;
type Request = { path: string; body: unknown; version: number };
type SaveState = "idle" | "saving" | "saved" | "error" | "conflict";
// Phone layout: which part of the editor fills the screen.
type View = "pages" | "map" | "panel";
const AUTOSAVE_MS = 2000;
const RETRY_MS = 8000;
const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  !!target.closest("input, textarea, select, [contenteditable]");

export function Studio({
  onPlay,
  onDirtyChange,
  aiWriting,
}: {
  onPlay: (id: string) => void;
  onDirtyChange: (dirty: boolean) => void;
  // The account may use AI writing help (Copilot feature).
  aiWriting: boolean;
}) {
  const [listing, setListing] = useState<Listing | null>(null);
  const [uploads, setUploads] = useState<UploadListing | null>(null);
  const [draft, setDraft] = useState<DraftRecord | null>(null);
  const [selected, setSelected] = useState("opening");
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState<{
    story: StoryData;
    save: Save;
  } | null>(null);
  const [passRoll, setPassRoll] = useState(true);
  const [retry, setRetry] = useState<Request | null>(null);
  const [offline, setOffline] = useState(!navigator.onLine);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [focus, setFocus] = useState(0);
  const [view, setView] = useState<View>("pages");
  const [back, setBack] = useState<View>("pages");
  const [pane, setPane] = useState<"page" | "story">("page");
  const [side, setSide] = useState<"pages" | "library">("pages");
  const [imageDialog, setImageDialog] = useState(false);
  // Comics: the panel being edited, and whether a comic draft shows the map.
  const [panel, setPanel] = useState<string | null>(null);
  const [comicMap, setComicMap] = useState(false);
  const [companion, setCompanion] = useState(false);
  const drawing = useDrawing();
  // A drawing to show once its draft has loaded.
  const reopen = useRef<Drawing | null>(null);
  const [, setHistoryTick] = useState(0);
  const draftRef = useRef<DraftRecord | null>(null);
  draftRef.current = draft;
  // Counts edits, so a save that returns after newer edits keeps them.
  const editVersion = useRef(0);
  const saving = useRef(false);
  // The edit count the server last confirmed.
  const savedVersion = useRef(-1);
  const past = useRef<Snapshot[]>([]);
  const future = useRef<Snapshot[]>([]);
  const lastPush = useRef(0);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    addEventListener("online", update);
    addEventListener("offline", update);
    const leave = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    addEventListener("beforeunload", leave);
    return () => {
      removeEventListener("online", update);
      removeEventListener("offline", update);
      removeEventListener("beforeunload", leave);
    };
  }, [dirty]);
  // The editor takes the whole window; the footer and phone tabs step aside.
  useEffect(() => {
    document.documentElement.classList.toggle("studio-editing", !!draft);
    return () => document.documentElement.classList.remove("studio-editing");
  }, [!!draft]);
  // Editor messages clear themselves after a moment.
  useEffect(() => {
    if (!notice || !draft) return;
    const timer = setTimeout(() => setNotice(""), 8000);
    return () => clearTimeout(timer);
  }, [notice, !!draft]);
  const work = async (fn: () => Promise<void>) => {
    setBusy(true);
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  };
  const loadList = async (cursor?: string) => {
    const result = await api<Listing>(
      `/studio${cursor ? `?cursor=${cursor}` : ""}`,
    );
    setListing((old) =>
      cursor && old
        ? { ...result, items: [...old.items, ...result.items] }
        : result,
    );
  };
  useEffect(() => {
    void work(() => loadList());
    // Clip uploads are optional; Studio still works if this listing fails.
    api<UploadListing>("/uploads").then(setUploads, () => {});
  }, []);
  const mediaFor = (video: string | undefined) => {
    const assetId = assetIdOf(video);
    return assetId
      ? uploads?.items.find((clip) => clip.id === assetId)?.media
      : resolveFixtureMedia(video ?? "");
  };
  const snapshot = (d: DraftRecord): Snapshot => ({
    story: d.story,
    description: d.description,
    pagePositions: d.pagePositions,
    comic: d.comic,
  });
  // Every edit goes through here: it marks the draft for autosave and keeps
  // undo history (quick successive edits, like typing, share one step).
  const edit = (update: (d: DraftRecord) => DraftRecord) => {
    const current = draftRef.current;
    if (!current) return;
    if (Date.now() - lastPush.current > 800) {
      past.current = [...past.current, snapshot(current)].slice(-60);
      future.current = [];
      setHistoryTick((t) => t + 1);
    }
    lastPush.current = Date.now();
    const next = update(current);
    draftRef.current = next;
    setDraft(next);
    editVersion.current++;
    setDirty(true);
    if (saveState === "saved") setSaveState("idle");
  };
  const restore = (from: typeof past, to: typeof future) => {
    const current = draftRef.current;
    const target = from.current.at(-1);
    if (!current || !target) return;
    from.current = from.current.slice(0, -1);
    to.current = [...to.current, snapshot(current)];
    lastPush.current = 0;
    const next = { ...current, ...target };
    draftRef.current = next;
    setDraft(next);
    editVersion.current++;
    setDirty(true);
    setHistoryTick((t) => t + 1);
    if (!next.story.pages[selected]) setSelected(next.story.entryPageId);
  };
  const undo = () => restore(past, future);
  const redo = () => restore(future, past);
  const change = (story: StoryData) => {
    edit((d) => ({ ...d, story }));
    setNotice("");
  };
  const page = draft?.story.pages[selected];
  // Each background-drawn image goes into the open draft it was drawn for.
  const placer = useRef<Placer>(() => {});
  placer.current = (shown, job, image, asset) => {
    addUpload(asset);
    if (draftRef.current?.story.id === shown.storyId)
      edit((d) => placeImage(d, shown, job, image));
  };
  useEffect(() => {
    setPlacer((...args) => placer.current(...args));
    return () => setPlacer(null);
  }, []);
  const addUpload = (asset: ClipAsset) =>
    setUploads(
      (old) =>
        old && {
          ...old,
          items: [asset, ...old.items.filter((a) => a.id !== asset.id)],
        },
    );
  const updatePage = (value: StoryPage) =>
    draft &&
    change({
      ...draft.story,
      pages: { ...draft.story.pages, [value.id]: value },
    });

  // Saves the current draft (or resends an unanswered save with its key).
  // Resolves with the saved record, or null if nothing was saved.
  const saveNow = useCallback(async (): Promise<DraftRecord | null> => {
    const current = draftRef.current;
    if (!current || saving.current || !navigator.onLine) return null;
    const request: Request = retry ?? {
      path: `/studio/${current.story.id}`,
      version: editVersion.current,
      body: {
        idempotencyKey: crypto.randomUUID(),
        expectedRevision: current.revision,
        draft: {
          story: current.story,
          description: current.description,
          pagePositions: Object.fromEntries(
            Object.entries(current.pagePositions ?? {}).filter(
              ([id]) => current.story.pages[id],
            ),
          ),
          ...(current.comic ? { comic: current.comic } : {}),
        },
      },
    };
    saving.current = true;
    setSaveState("saving");
    setRetry(request);
    try {
      const saved = await api<DraftRecord>(request.path, request.body);
      setRetry(null);
      savedVersion.current = request.version;
      if (editVersion.current === request.version) {
        draftRef.current = saved;
        setDraft(saved);
        setDirty(false);
      } else
        setDraft((d) => {
          const next = d && {
            ...d,
            revision: saved.revision,
            publishedVersionId: saved.publishedVersionId,
          };
          draftRef.current = next;
          return next;
        });
      setSaveState("saved");
      if (!listing?.items.some((item) => item.id === saved.story.id))
        void loadList().catch(() => {});
      return saved;
    } catch (error) {
      if (error instanceof ApiError && error.code !== "UNAVAILABLE")
        setRetry(null);
      if (error instanceof ApiError && error.code === "STALE_REVISION") {
        setSaveState("conflict");
        setNotice(error.message);
      } else setSaveState("error");
      return null;
    } finally {
      saving.current = false;
    }
  }, [retry, listing]);
  // Waits for a save in flight, then saves anything newer.
  const flush = async () => {
    while (saving.current) await new Promise((r) => setTimeout(r, 150));
    const current = draftRef.current;
    if (!current) return null;
    if (
      current.revision &&
      !retry &&
      savedVersion.current === editVersion.current
    )
      return current;
    return saveNow();
  };
  // Autosave shortly after editing stops; retry a failed save more slowly.
  useEffect(() => {
    if (!draft || !dirty || offline || saveState === "conflict") return;
    const timer = setTimeout(
      () => void saveNow(),
      saveState === "error" ? RETRY_MS : AUTOSAVE_MS,
    );
    return () => clearTimeout(timer);
  }, [draft, dirty, offline, saveState, saveNow]);
  // Ctrl/Cmd+S saves now; Ctrl/Cmd+Z and Shift+Z undo and redo outside text
  // fields (fields keep their own text undo).
  useEffect(() => {
    if (!draft) return;
    const keys = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === "s") {
        e.preventDefault();
        void saveNow();
      } else if (key === "z" && !typing(e.target) && !preview) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (key === "y" && !typing(e.target) && !preview) {
        e.preventDefault();
        redo();
      }
    };
    addEventListener("keydown", keys);
    return () => removeEventListener("keydown", keys);
  });

  const resetEditor = (loaded: DraftRecord, isDirty: boolean) => {
    // Images drawn in the background while this draft was closed.
    const d = withDrawnImages(loaded);
    if (d !== loaded) isDirty = true;
    draftRef.current = d;
    setDraft(d);
    setSelected(d.story.entryPageId);
    setDirty(isDirty);
    setPreview(null);
    setRetry(null);
    setSaveState(isDirty ? "idle" : "saved");
    past.current = [];
    future.current = [];
    editVersion.current++;
    savedVersion.current = isDirty ? -1 : editVersion.current;
    setView("map");
    setPane("page");
    setFocus(0);
    setPanel(null);
    setCompanion(false);
    setComicMap(false);
    const shown = reopen.current;
    reopen.current = null;
    if (shown?.storyId === d.story.id && d.story.pages[shown.pageId]) {
      setSelected(shown.pageId);
      setCompanion(true);
    }
  };
  // Opens the companion on a background drawing's comic, loading its draft
  // first when another one (or none) is open.
  const showDrawing = (shown: Drawing) => {
    if (draftRef.current?.story.id === shown.storyId) {
      setSelected(shown.pageId);
      setComicMap(false);
      setPane("page");
      setCompanion(true);
      return;
    }
    void work(async () => {
      if (draftRef.current && !(await flush())) {
        setNotice(
          "This draft isn't saved yet. Try again, or reconnect to save.",
        );
        return;
      }
      reopen.current = shown;
      resetEditor(await api<DraftRecord>(`/studio/${shown.storyId}`), false);
    });
  };
  const open = (id: string) =>
    void work(async () => {
      resetEditor(await api<DraftRecord>(`/studio/${id}`), false);
    });
  const create = (kind: "story" | "quiz" | "comic" = "story") => {
    const id = `story-${crypto.randomUUID()}`;
    resetEditor(
      {
        revision: 0,
        publishedVersionId: null,
        description: "",
        story:
          kind === "quiz"
            ? quizTemplate(id)
            : kind === "comic"
              ? comicTemplate(id)
              : blankStory(id),
        ...(kind === "comic" ? { comic: { style: "", cast: [] } } : {}),
      },
      true,
    );
    // A new comic starts with the companion, when AI help is available.
    setCompanion(kind === "comic" && !assistReason);
    setNotice("");
  };
  const close = () =>
    void work(async () => {
      if (!(await flush())) {
        setNotice(
          "This draft isn't saved yet. Try again, or reconnect to save.",
        );
        return;
      }
      setDraft(null);
      draftRef.current = null;
      setDirty(false);
      setPreview(null);
      await loadList();
    });
  const publish = () =>
    void work(async () => {
      validatePublication(draftRef.current!.story);
      if (!(await flush()))
        throw new Error(
          "The draft couldn't be saved, so it wasn't published. Try again.",
        );
      const current = draftRef.current!;
      const published = await api<DraftRecord>(
        `/studio/${current.story.id}/publish`,
        {
          idempotencyKey: crypto.randomUUID(),
          expectedRevision: current.revision,
          policyVersion: "creator-alpha-1",
        },
      );
      draftRef.current = published;
      setDraft(published);
      setDirty(false);
      setSaveState("saved");
      setNotice(
        `Published ${published.publishedVersionId}. Your story is now in Discover.`,
      );
      await loadList();
    });
  const startPreview = () => {
    if (!draft) return;
    try {
      const story = validatePublication(draft.story);
      setPreview({
        story,
        save: start(story, "preview", "preview", baseStats, Date.now()),
      });
      setNotice("");
    } catch (e) {
      setNotice((e as Error).message);
    }
  };
  // Selecting a page edits it: on a phone the settings fill the screen.
  const select = (id: string, from: View) => {
    setSelected(id);
    setPane("page");
    setBack(from);
    setView("panel");
    if (from !== "map") setFocus((f) => f + 1);
  };

  const setType = (type: StoryPage["pageType"]) => {
    if (!page || !draft) return;
    const {
      video: _,
      videoAdvance: _advance,
      sourcePage: _source,
      comic: _comic,
      ...rest
    } = page;
    if (type === "comic") {
      // Panels replace the page photo; the page keeps its one output.
      const { image: _image, ...plain } = rest;
      updatePage({
        ...plain,
        pageType: type,
        comic: page.comic ?? newComic(),
        choices: page.kind === "ending" ? [] : [choice()],
      });
      return;
    }
    if (type === "reveal") {
      // A reveal needs at least two results; start with two new endings.
      const ids = [`result-${shortId()}`, `result-${shortId()}`];
      change({
        ...draft.story,
        pages: {
          ...draft.story.pages,
          ...Object.fromEntries(
            ids.map((r, i) => [
              r,
              ending(r, `Result ${i + 1}`, "Describe this result."),
            ]),
          ),
          [page.id]: {
            ...rest,
            pageType: type,
            kind: "scene",
            choices: [revealChoice(ids.map((r) => result(draft.story.id, r)))],
          },
        },
      });
      return;
    }
    const c = choice();
    if (type === "dice") {
      c.label = "Roll d20";
      c.outcome = {
        kind: "dice",
        sides: 20,
        target: 10,
        success: route("ending"),
        failure: route("ending"),
      };
    }
    updatePage({
      ...rest,
      pageType: type,
      kind: type === "dice" ? "scene" : page.kind,
      ...(type.startsWith("video") ? { video: media[0].landscape.src } : {}),
      choices: page.kind === "ending" && type !== "dice" ? [] : [c],
    });
  };
  const targetSelect = (
    label: string,
    target: string,
    update: (id: string) => void,
  ) => (
    <label>
      {label}
      <select
        aria-label={label}
        value={target}
        onChange={(e) => update(e.target.value)}
      >
        {draft &&
          Object.values(draft.story.pages).map((p) => (
            <option key={p.id} value={p.id}>
              {p.title} ({p.id})
            </option>
          ))}
      </select>
    </label>
  );
  // Results come from the story's reveal pages, named by their page titles.
  const quizResults = draft
    ? Object.values(draft.story.pages).flatMap((p) =>
        p.choices.flatMap((c) =>
          c.outcome.kind === "reveal" ? c.outcome.results : [],
        ),
      )
    : [];
  const editChoice = (index: number, c: Choice) =>
    page &&
    updatePage({
      ...page,
      choices: page.choices.map((old, i) => (i === index ? c : old)),
    });
  const addGraphPage = (
    type: "text" | "text-options" | "video" | "video-options" | "ending",
    branch = false,
  ) => {
    if (!draft || Object.keys(draft.story.pages).length >= 80) return;
    const id = `page-${shortId()}`;
    const target =
      Object.values(draft.story.pages).find((p) => p.kind === "ending")?.id ??
      draft.story.entryPageId;
    const linear =
      page?.choices.length === 1 &&
      page.choices[0].outcome.kind === "direct" &&
      !page.pageType.endsWith("options");
    const next =
      linear && !branch && page.choices[0].outcome.kind === "direct"
        ? page.choices[0].outcome.route.targetPageId
        : target;
    const added: StoryPage = {
      ...makePage(id),
      title: type === "ending" ? "New ending" : "New page",
      pageType: type === "ending" ? "text" : type,
      kind: type === "ending" ? "ending" : "scene",
      choices: type === "ending" ? [] : [choice(next)],
      ...(type.startsWith("video") ? { video: media[0].landscape.src } : {}),
    };
    let story = {
      ...draft.story,
      pages: { ...draft.story.pages, [id]: added },
    };
    if (branch && page) {
      const { sourcePage: _source, videoAdvance: _advance, ...rest } = page;
      story.pages[page.id] = {
        ...rest,
        pageType: page.pageType.startsWith("video")
          ? "video-options"
          : "text-options",
        choices: [
          ...page.choices,
          { ...choice(id), label: `Option ${page.choices.length + 1}` },
        ],
      };
    } else if (linear && page)
      story = connectPage(
        story,
        page.id,
        { choiceId: page.choices[0].id, slot: 0 },
        id,
      );
    change(story);
    setSelected(id);
    setPane("page");
    setFocus((f) => f + 1);
    setPreview(null);
  };
  // Accepted AI choices: each becomes an option leading to a new page that
  // continues where this page's single output went (or to an ending).
  const addSuggestedChoices = (suggested: AssistChoice[]) => {
    if (!draft || !page) return;
    const room = 80 - Object.keys(draft.story.pages).length;
    const picks = suggested.slice(0, Math.max(0, room));
    if (!picks.length) {
      setNotice("This story has the most pages it can hold (80).");
      return;
    }
    const fallback =
      Object.values(draft.story.pages).find((p) => p.kind === "ending")?.id ??
      draft.story.entryPageId;
    const onward =
      page.choices.length === 1 && page.choices[0].outcome.kind === "direct"
        ? page.choices[0].outcome.route.targetPageId
        : fallback;
    const created = picks.map((pick) => ({
      ...makePage(`page-${shortId()}`),
      title: pick.title,
      transcript: pick.text || "What happens here?",
      choices: [choice(onward)],
    }));
    const { sourcePage: _source, videoAdvance: _advance, ...rest } = page;
    // A plain page becomes an options page; its old "Continue" is replaced.
    const keep = page.pageType.endsWith("options") ? page.choices : [];
    change({
      ...draft.story,
      pages: {
        ...draft.story.pages,
        ...Object.fromEntries(created.map((p) => [p.id, p])),
        [page.id]: {
          ...rest,
          pageType: page.pageType.startsWith("video")
            ? "video-options"
            : "text-options",
          choices: [
            ...keep,
            ...created.map((p, i) => ({
              ...choice(p.id),
              label: picks[i].label,
            })),
          ].slice(0, 20),
        },
      },
    });
  };

  const saveLabel = offline
    ? "Offline"
    : saveState === "conflict"
      ? "Changed elsewhere"
      : saveState === "saving"
        ? "Saving…"
        : saveState === "error"
          ? "Not saved"
          : dirty
            ? "Unsaved changes"
            : draft?.revision
              ? "All changes saved"
              : "Not saved yet";
  const assistReason = aiWriting
    ? null
    : "AI writing help isn't enabled for this account yet.";

  const notices = (
    <div className="app-notices" aria-live="polite">
      {(notice || offline) && (
        <div className="notice">
          {offline
            ? "You’re offline. Editing can continue; reconnect to save."
            : notice}
          <Button onClick={() => setNotice("")} aria-label="Dismiss message">
            ×
          </Button>
        </div>
      )}
      {busy && (
        <div className="loading-overlay" role="status">
          <span className="loading-card">Working on your story…</span>
        </div>
      )}
    </div>
  );

  if (!draft)
    return (
      <section className="studio">
        <div className="studio-head">
          <div>
            <h1>Studio</h1>
            <p className="studio-sub">
              Write a branching story, a quiz or a comic, preview it, then
              publish an edition. Players keep the edition they started.
            </p>
          </div>
          <div className="studio-head-actions">
            <Button
              className="btn btn-primary"
              disabled={busy}
              onClick={() => create()}
            >
              New story
            </Button>
            <Button
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => create("quiz")}
            >
              New quiz
            </Button>
            <Button
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => create("comic")}
            >
              New comic
            </Button>
          </div>
        </div>
        {notices}
        <DrawingStatus drawing={drawing} onView={showDrawing} />
        {!listing && !busy && (
          <Button onClick={() => void work(() => loadList())}>
            Retry loading drafts
          </Button>
        )}
        {listing && !listing.canPublish && (
          <p className="studio-note">
            Publishing is invite-only during alpha. Drafts and previews are
            available; ask the Storybranch team to turn on publishing for your
            account.
          </p>
        )}
        <h2 className="studio-drafts-title">Your drafts</h2>
        {!listing ? (
          <div className="studio-draft-grid" aria-hidden="true">
            <div className="placeholder-block" />
            <div className="placeholder-block" />
            <div className="placeholder-block" />
          </div>
        ) : listing.items.length ? (
          <div className="studio-draft-grid">
            {listing.items.map((d) => (
              <Button
                key={d.id}
                className="studio-draft-card"
                disabled={busy}
                onClick={() => open(d.id)}
              >
                <span className="studio-draft-title" title={d.title}>
                  {d.title}
                </span>
                <small>
                  {d.publishedVersionId
                    ? `Published · ${d.publishedVersionId}`
                    : "Private draft"}
                </small>
              </Button>
            ))}
          </div>
        ) : (
          <div className="studio-start">
            <h2>Start your first story</h2>
            <p className="studio-sub">
              A story is a set of pages linked by choices: text, video, dice
              rolls, quiz results and comics. Start from a blank story, a
              ready-made quiz or a four-panel comic.
            </p>
          </div>
        )}
        {listing?.nextCursor && (
          <Button
            className="btn btn-secondary studio-more"
            disabled={busy}
            onClick={() => void work(() => loadList(listing.nextCursor!))}
          >
            More drafts
          </Button>
        )}
      </section>
    );

  // A comic draft edits its comic on the canvas instead of the story map.
  const comicView = !!draft.comic && page?.pageType === "comic" && !comicMap;
  const canUndo = past.current.length > 0;
  const canRedo = future.current.length > 0;
  return (
    <section className="studio studio-shell" data-view={view}>
      {notices}
      <DrawingStatus drawing={drawing} onView={showDrawing} />
      <header className="studio-bar">
        <Button
          className="studio-bar-back"
          disabled={busy}
          aria-label="Back to drafts"
          title="Back to drafts"
          onClick={close}
        >
          ←
        </Button>
        <input
          className="studio-title-input"
          aria-label="Story title"
          maxLength={160}
          value={draft.story.title}
          disabled={busy}
          onChange={(e) => change({ ...draft.story, title: e.target.value })}
        />
        <span
          className={`studio-status is-${saveState} ${dirty ? "is-dirty" : ""}`}
          role="status"
          title="Drafts save automatically. Ctrl/Cmd+S saves now."
        >
          {saveLabel}
        </span>
        {(saveState === "error" || saveState === "conflict" || retry) &&
          !busy && (
            <Button
              className="btn btn-secondary btn-small"
              disabled={offline || saving.current}
              onClick={() =>
                saveState === "conflict"
                  ? confirm(
                      "Discard your unsaved edits and load the saved draft?",
                    ) && open(draft.story.id)
                  : void saveNow()
              }
            >
              {saveState === "conflict" ? "Reload saved draft" : "Retry save"}
            </Button>
          )}
        <div className="studio-bar-actions">
          <div className="studio-history" role="group" aria-label="History">
            <Button
              aria-label="Undo"
              title="Undo (Ctrl/Cmd+Z)"
              disabled={!canUndo || busy}
              onClick={undo}
            >
              ↶
            </Button>
            <Button
              aria-label="Redo"
              title="Redo (Ctrl/Cmd+Shift+Z)"
              disabled={!canRedo || busy}
              onClick={redo}
            >
              ↷
            </Button>
          </div>
          <Button
            className="btn btn-secondary btn-small studio-save"
            disabled={busy || offline || saveState === "saving"}
            title="Ctrl/Cmd+S"
            onClick={() => void saveNow()}
          >
            Save draft
          </Button>
          <Button
            className="btn btn-secondary btn-small"
            disabled={busy}
            onClick={startPreview}
          >
            Preview
          </Button>
          {draft.publishedVersionId && (
            <Button
              className="btn btn-secondary btn-small studio-play"
              disabled={busy || dirty}
              onClick={() => onPlay(draft.story.id)}
            >
              Play published story
            </Button>
          )}
          <Button
            className="btn btn-coral btn-small"
            disabled={busy || offline || !listing?.canPublish}
            title={
              listing?.canPublish
                ? "Saves, then publishes a new edition"
                : "Publishing is invite-only during alpha"
            }
            onClick={publish}
          >
            Publish edition
          </Button>
        </div>
      </header>

      <nav className="studio-views" aria-label="Editor views">
        {(
          [
            ["pages", "Pages"],
            ["map", comicView ? "Comic" : "Map"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            aria-pressed={view === value}
            onClick={() => setView(value)}
          >
            {label}
          </button>
        ))}
        <button
          aria-pressed={view === "panel"}
          onClick={() => {
            setBack(view === "panel" ? back : view);
            setView("panel");
          }}
        >
          {pane === "story" ? "Story" : "Edit page"}
        </button>
      </nav>

      <div className="studio-body">
        <aside className="studio-side" aria-label="Pages and library">
          <div className="studio-tabs" role="group" aria-label="Side panel">
            <button
              aria-pressed={side === "pages"}
              onClick={() => setSide("pages")}
            >
              Pages
            </button>
            <button
              aria-pressed={side === "library"}
              onClick={() => setSide("library")}
            >
              Library
            </button>
          </div>
          <div className="studio-scroll">
            {side === "pages" ? (
              <>
                <StoryOutline
                  story={draft.story}
                  selected={selected}
                  onSelect={(id) => select(id, "pages")}
                />
                <Button
                  className="btn btn-secondary btn-small studio-story-link"
                  onClick={() => {
                    setPane("story");
                    setBack("pages");
                    setView("panel");
                  }}
                >
                  Story details
                </Button>
              </>
            ) : (
              <PageLibrary
                api={api}
                uploads={uploads}
                page={page}
                disabled={busy || Object.keys(draft.story.pages).length >= 80}
                key={draft.story.id}
                onSaved={(record, instanceId) => {
                  edit((current) => {
                    const instance = current.story.pages[instanceId];
                    if (!instance) return current;
                    return {
                      ...current,
                      story: {
                        ...current.story,
                        pages: {
                          ...current.story.pages,
                          [instanceId]: {
                            ...instance,
                            sourcePage: {
                              id: record.id,
                              revision: record.revision,
                            },
                          },
                        },
                      },
                    };
                  });
                }}
                onInsert={(instance) => {
                  const target = Object.values(draft.story.pages).find(
                    (p) => p.kind === "ending",
                  )?.id;
                  if (!target) {
                    setNotice("Add an ending before placing a reusable page.");
                    return;
                  }
                  instance.choices = instance.choices.map((c) => ({
                    ...c,
                    outcome: { kind: "direct", route: route(target) },
                  }));
                  change({
                    ...draft.story,
                    pages: { ...draft.story.pages, [instance.id]: instance },
                  });
                  setSelected(instance.id);
                  setFocus((f) => f + 1);
                }}
              />
            )}
          </div>
        </aside>

        <div className={`studio-canvas${draft.comic ? " is-comic" : ""}`}>
          {draft.comic && comicMap && page?.pageType === "comic" && (
            <div className="comic-workspace-bar">
              <p className="muted">Story map</p>
              <button
                className="btn btn-secondary btn-small"
                onClick={() => setComicMap(false)}
              >
                Back to the comic
              </button>
            </div>
          )}
          {comicView && page ? (
            <ComicWorkspace
              page={page}
              uploads={uploads}
              selectedPanel={panel}
              onSelectPanel={(id) => {
                setPanel(id);
                setPane("page");
                setBack("map");
                setView("panel");
              }}
              onShowMap={() => setComicMap(true)}
            />
          ) : (
            <StoryGraph
              key={draft.story.id}
              story={draft.story}
              positions={draft.pagePositions}
              selected={selected}
              disabled={busy}
              focus={focus}
              onSelect={(id) => select(id, "map")}
              onMove={(pagePositions) =>
                edit((current) => ({ ...current, pagePositions }))
              }
              onConnect={(source, edge, target) => {
                try {
                  change(connectPage(draft.story, source, edge, target));
                  setPreview(null);
                } catch (e) {
                  setNotice((e as Error).message);
                }
              }}
              onAdd={(type) => addGraphPage(type)}
              onBranch={() => addGraphPage("text", true)}
            />
          )}
        </div>

        <aside className="studio-panel" aria-label="Settings">
          <div className="studio-tabs" role="group" aria-label="Settings panel">
            <button
              className="studio-panel-back"
              aria-label="Back"
              onClick={() => setView(back)}
            >
              ←
            </button>
            <button
              aria-pressed={pane === "page"}
              onClick={() => setPane("page")}
            >
              Page
            </button>
            <button
              aria-pressed={pane === "story"}
              onClick={() => setPane("story")}
            >
              Story
            </button>
          </div>
          <div className="studio-scroll">
            {pane === "story" ? (
              <fieldset className="studio-story-settings" disabled={busy}>
                <legend>Story details</legend>
                <label>
                  Description
                  <textarea
                    aria-label="Description"
                    rows={4}
                    maxLength={500}
                    value={draft.description}
                    onChange={(e) =>
                      edit((d) => ({ ...d, description: e.target.value }))
                    }
                  />
                </label>
                {targetSelect(
                  "First page",
                  draft.story.entryPageId,
                  (entryPageId) => change({ ...draft.story, entryPageId }),
                )}
                <p className="studio-publish-note">
                  Publish makes this story public in Discover. Only publish
                  content you have rights to share. Sample clips are
                  placeholders. Uploaded clips become public when you publish a
                  story that uses them.
                </p>
                <p className="studio-publish-note">
                  {draft.publishedVersionId
                    ? `Published as ${draft.publishedVersionId}. Players keep the edition they started; publishing again makes a new one.`
                    : "Not published yet."}{" "}
                  Saved revision {draft.revision}.
                </p>
                {draft.revision > 0 && (
                  <Button
                    className="btn btn-secondary btn-small"
                    disabled={busy || offline}
                    onClick={() => {
                      if (
                        !dirty ||
                        confirm(
                          "Discard unsaved edits and reload the saved draft?",
                        )
                      )
                        open(draft.story.id);
                    }}
                  >
                    Reload saved draft
                  </Button>
                )}
              </fieldset>
            ) : (
              <fieldset className="studio-page-inspector" disabled={busy}>
                <legend>Page settings</legend>
                <label>
                  Edit page
                  <select
                    aria-label="Edit page"
                    value={selected}
                    onChange={(e) => {
                      setSelected(e.target.value);
                      setFocus((f) => f + 1);
                      setPreview(null);
                    }}
                  >
                    {Object.values(draft.story.pages).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title} ({p.id})
                      </option>
                    ))}
                  </select>
                </label>
                {page && (
                  <>
                    <label>
                      Page title
                      <input
                        maxLength={160}
                        value={page.title}
                        onChange={(e) =>
                          updatePage({ ...page, title: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Page type
                      <select
                        aria-label="Page type"
                        value={page.pageType}
                        onChange={(e) =>
                          setType(e.target.value as StoryPage["pageType"])
                        }
                      >
                        {[
                          "text",
                          "text-options",
                          "video",
                          "video-options",
                          "dice",
                          "reveal",
                          "comic",
                        ].map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                    </label>
                    <PageAssist
                      api={api}
                      story={draft.story}
                      description={draft.description}
                      page={page}
                      reason={assistReason}
                      onText={(transcript) =>
                        updatePage({ ...page, transcript })
                      }
                      onChoices={addSuggestedChoices}
                    >
                      <label>
                        Text / transcript
                        <textarea
                          aria-label="Text / transcript"
                          rows={8}
                          maxLength={10000}
                          value={page.transcript}
                          onChange={(e) =>
                            updatePage({ ...page, transcript: e.target.value })
                          }
                        />
                      </label>
                    </PageAssist>
                    {page.pageType.startsWith("video") && (
                      <ClipPicker
                        api={api}
                        value={page.video}
                        uploads={uploads}
                        disabled={busy}
                        onChange={(video) => updatePage({ ...page, video })}
                        onUploaded={(asset) =>
                          setUploads(
                            (old) =>
                              old && {
                                ...old,
                                items: [
                                  asset,
                                  ...old.items.filter((c) => c.id !== asset.id),
                                ],
                              },
                          )
                        }
                      />
                    )}
                    {page.pageType === "video" && (
                      <label>
                        After the video ends
                        <select
                          aria-label="After the video ends"
                          value={page.videoAdvance ?? "auto"}
                          onChange={(e) =>
                            updatePage({
                              ...page,
                              videoAdvance: e.target.value as
                                | "auto"
                                | "continue",
                            })
                          }
                        >
                          <option value="auto">Automatically continue</option>
                          <option value="continue">Wait for Continue</option>
                        </select>
                      </label>
                    )}
                    {page.pageType === "comic" ? (
                      <ComicEditor
                        api={api}
                        draft={draft}
                        page={page}
                        uploads={uploads}
                        busy={busy}
                        assistReason={assistReason}
                        selectedPanel={panel}
                        onSelectPanel={setPanel}
                        onEdit={edit}
                        onUploaded={addUpload}
                        companion={companion}
                        onCompanion={setCompanion}
                      />
                    ) : (
                      <>
                        <ClipPicker
                          kind="image"
                          api={api}
                          value={page.image}
                          uploads={uploads}
                          disabled={busy}
                          onChange={(image) => {
                            const { image: _, ...rest } = page;
                            updatePage(image ? { ...rest, image } : rest);
                          }}
                          onUploaded={addUpload}
                        />
                        <button
                          className="assist-button studio-image-button"
                          disabled={busy}
                          onClick={() => setImageDialog(true)}
                        >
                          ✦ Generate a page image
                        </button>
                      </>
                    )}
                    {page.sourcePage && (
                      <p>
                        Library revision {page.sourcePage.revision}. Save
                        content edits to the library before publishing; story
                        routes stay separate.
                      </p>
                    )}
                    {page.pageType !== "dice" && page.pageType !== "reveal" && (
                      <label>
                        <input
                          type="checkbox"
                          checked={page.kind === "ending"}
                          onChange={(e) =>
                            updatePage({
                              ...page,
                              kind: e.target.checked ? "ending" : "scene",
                              choices: e.target.checked ? [] : [choice()],
                            })
                          }
                        />{" "}
                        End this story here
                      </label>
                    )}
                    <h3>Outputs</h3>
                    {page.kind === "ending" && (
                      <p>
                        This closes the story and offers replay or another
                        adventure.
                      </p>
                    )}
                    {page.choices.map((c, i) => (
                      <div className="studio-output" key={c.id}>
                        <label>
                          Option {i + 1} label
                          <input
                            value={c.label}
                            maxLength={160}
                            onChange={(e) =>
                              editChoice(i, { ...c, label: e.target.value })
                            }
                          />
                        </label>
                        {c.outcome.kind === "direct" ? (
                          targetSelect(
                            "Next page",
                            c.outcome.route.targetPageId,
                            (target) =>
                              editChoice(i, {
                                ...c,
                                outcome: {
                                  kind: "direct",
                                  route: {
                                    ...(c.outcome.kind === "direct"
                                      ? c.outcome.route
                                      : route(target)),
                                    targetPageId: target,
                                  },
                                },
                              }),
                          )
                        ) : c.outcome.kind === "dice" ? (
                          <>
                            <label>
                              Die sides
                              <input
                                type="number"
                                min={2}
                                max={100}
                                value={c.outcome.sides}
                                onChange={(e) =>
                                  c.outcome.kind === "dice" &&
                                  editChoice(i, {
                                    ...c,
                                    outcome: {
                                      ...c.outcome,
                                      sides: Number(e.target.value),
                                    },
                                  })
                                }
                              />
                            </label>
                            <label>
                              Pass threshold
                              <input
                                type="number"
                                min={1}
                                max={100}
                                value={c.outcome.target}
                                onChange={(e) =>
                                  c.outcome.kind === "dice" &&
                                  editChoice(i, {
                                    ...c,
                                    outcome: {
                                      ...c.outcome,
                                      target: Number(e.target.value),
                                    },
                                  })
                                }
                              />
                            </label>
                            {targetSelect(
                              "Pass page",
                              c.outcome.success.targetPageId,
                              (target) =>
                                c.outcome.kind === "dice" &&
                                editChoice(i, {
                                  ...c,
                                  outcome: {
                                    ...c.outcome,
                                    success: route(target),
                                  },
                                }),
                            )}
                            {targetSelect(
                              "Fail page",
                              c.outcome.failure.targetPageId,
                              (target) =>
                                c.outcome.kind === "dice" &&
                                editChoice(i, {
                                  ...c,
                                  outcome: {
                                    ...c.outcome,
                                    failure: route(target),
                                  },
                                }),
                            )}
                          </>
                        ) : c.outcome.kind === "reveal" ? (
                          <>
                            <p>
                              Players see the result their answers counted
                              toward most. A tie goes to the result listed
                              first.
                            </p>
                            {c.outcome.results.map((r, j, results) => (
                              <div className="studio-actions" key={r.scoreId}>
                                {targetSelect(
                                  `Result ${j + 1} page`,
                                  r.route.targetPageId,
                                  (target) =>
                                    editChoice(i, {
                                      ...c,
                                      outcome: {
                                        kind: "reveal",
                                        results: results.map((x, k) =>
                                          k === j
                                            ? { ...x, route: route(target) }
                                            : x,
                                        ),
                                      },
                                    }),
                                )}
                                {results.length > 2 && (
                                  <Button
                                    onClick={() =>
                                      editChoice(i, {
                                        ...c,
                                        outcome: {
                                          kind: "reveal",
                                          results: results.filter(
                                            (_, k) => k !== j,
                                          ),
                                        },
                                      })
                                    }
                                  >
                                    Remove result {j + 1}
                                  </Button>
                                )}
                              </div>
                            ))}
                            <Button
                              disabled={
                                c.outcome.results.length >= 12 ||
                                Object.keys(draft.story.pages).length >= 80
                              }
                              onClick={() => {
                                if (c.outcome.kind !== "reveal") return;
                                const id = `result-${shortId()}`;
                                change({
                                  ...draft.story,
                                  pages: {
                                    ...draft.story.pages,
                                    [id]: ending(
                                      id,
                                      `Result ${c.outcome.results.length + 1}`,
                                      "Describe this result.",
                                    ),
                                    [page.id]: {
                                      ...page,
                                      choices: [
                                        {
                                          ...c,
                                          outcome: {
                                            kind: "reveal",
                                            results: [
                                              ...c.outcome.results,
                                              result(draft.story.id, id),
                                            ],
                                          },
                                        },
                                      ],
                                    },
                                  },
                                });
                              }}
                            >
                              Add result
                            </Button>
                          </>
                        ) : (
                          <p>Stat check configured in advanced outputs.</p>
                        )}
                        {c.outcome.kind === "direct" &&
                          quizResults.length > 0 && (
                            <label>
                              Counts toward
                              <select
                                aria-label={`Option ${i + 1} counts toward`}
                                value={scoreOf(c) ?? ""}
                                onChange={(e) =>
                                  editChoice(
                                    i,
                                    countToward(c, e.target.value || undefined),
                                  )
                                }
                              >
                                <option value="">No result</option>
                                {quizResults.map((r) => (
                                  <option key={r.scoreId} value={r.scoreId}>
                                    {draft.story.pages[r.route.targetPageId]
                                      ?.title ?? r.route.targetPageId}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}
                        {page.pageType.endsWith("options") && (
                          <Button
                            onClick={() =>
                              updatePage({
                                ...page,
                                choices: page.choices.filter((_, j) => j !== i),
                              })
                            }
                          >
                            Remove option {i + 1}
                          </Button>
                        )}
                      </div>
                    ))}
                    {page.kind !== "ending" &&
                      page.pageType.endsWith("options") && (
                        <Button
                          disabled={page.choices.length >= 20}
                          onClick={() =>
                            updatePage({
                              ...page,
                              choices: [...page.choices, choice()],
                            })
                          }
                        >
                          Add option
                        </Button>
                      )}
                    <details>
                      <summary>Advanced conditions and effects (JSON)</summary>
                      <p>
                        Use story namespace <code>{draft.story.id}:</code> for
                        keys and items. Changes apply when leaving the field;
                        invalid JSON is rejected.
                      </p>
                      <label>
                        Outputs JSON
                        <textarea
                          key={`${page.id}-choices-${JSON.stringify(page.choices)}`}
                          aria-label="Outputs JSON"
                          rows={8}
                          defaultValue={JSON.stringify(page.choices, null, 2)}
                          onBlur={(e) => {
                            try {
                              const choices = z
                                .array(choiceSchema)
                                .max(20)
                                .parse(JSON.parse(e.target.value));
                              updatePage({ ...page, choices });
                            } catch {
                              setNotice(
                                "Invalid outputs JSON. Your last valid outputs are unchanged.",
                              );
                            }
                          }}
                        />
                      </label>
                      <label>
                        Entry effects JSON
                        <textarea
                          key={`${page.id}-effects`}
                          aria-label="Entry effects JSON"
                          rows={4}
                          defaultValue={JSON.stringify(
                            page.entryEffects,
                            null,
                            2,
                          )}
                          onBlur={(e) => {
                            try {
                              updatePage({
                                ...page,
                                entryEffects: z
                                  .array(effectSchema)
                                  .max(20)
                                  .parse(JSON.parse(e.target.value)),
                              });
                            } catch {
                              setNotice(
                                "Invalid effects JSON. Your last valid effects are unchanged.",
                              );
                            }
                          }}
                        />
                      </label>
                    </details>
                    <Button
                      disabled={page.id === draft.story.entryPageId}
                      onClick={() => {
                        const pages = { ...draft.story.pages };
                        delete pages[page.id];
                        change({ ...draft.story, pages });
                        setSelected(draft.story.entryPageId);
                      }}
                    >
                      Delete page
                    </Button>
                  </>
                )}
              </fieldset>
            )}
          </div>
        </aside>
      </div>

      {imageDialog && page && (
        <PageImageDialog
          api={api}
          story={draft.story}
          description={draft.description}
          page={page}
          assistReason={assistReason}
          onClose={() => setImageDialog(false)}
          onAttach={(asset) => {
            setUploads(
              (old) =>
                old && {
                  ...old,
                  items: [asset, ...old.items.filter((a) => a.id !== asset.id)],
                },
            );
            const current = draftRef.current?.story.pages[page.id];
            if (current) updatePage({ ...current, image: assetRef(asset.id) });
            setNotice("Image generated and placed on this page.");
          }}
        />
      )}

      {preview && (
        <div className="studio-preview-backdrop">
          <section
            className="studio-preview"
            role="dialog"
            aria-modal="true"
            aria-labelledby="studio-preview-title"
          >
            <div className="studio-preview-head">
              <div>
                <h2 id="studio-preview-title">Private preview</h2>
                <p>
                  Test only — progress is not saved. Dice can be forced to test
                  routes.
                </p>
              </div>
              <label>
                Preview dice result
                <select
                  aria-label="Preview dice result"
                  value={passRoll ? "pass" : "fail"}
                  onChange={(e) => setPassRoll(e.target.value === "pass")}
                >
                  <option value="pass">Highest roll</option>
                  <option value="fail">Lowest roll</option>
                </select>
              </label>
              <Button
                className="btn btn-secondary btn-small"
                onClick={() => setPreview(null)}
              >
                Close preview
              </Button>
            </div>
            <div className="studio-preview-stage">
              <Story
                story={preview.story}
                save={preview.save}
                user={{
                  id: "preview",
                  stats: baseStats,
                  achievements: [],
                  saveSpots: [],
                }}
              >
                <Page
                  page={preview.story.pages[preview.save.pageId]}
                  result={isResultPage(preview.story, preview.save.pageId)}
                  media={mediaFor(
                    preview.story.pages[preview.save.pageId].video,
                  )}
                  image={
                    uploads?.items.find(
                      (a) =>
                        a.id ===
                        assetIdOf(
                          preview.story.pages[preview.save.pageId].image,
                        ),
                    )?.url
                  }
                  panels={(() => {
                    const comic =
                      preview.story.pages[preview.save.pageId].comic;
                    return comic && panelImages(comic, uploads);
                  })()}
                  disabled={false}
                  transitioning={false}
                  onPlaybackChange={() => {}}
                  onOutput={(output) => {
                    try {
                      const moved = transition(
                        preview.story,
                        preview.save,
                        output.choiceId,
                        preview.save.revision,
                        Date.now(),
                        (sides) => (passRoll ? sides : 1),
                        output.action,
                      );
                      setPreview({ ...preview, save: moved.save });
                    } catch (e) {
                      setNotice((e as Error).message);
                    }
                  }}
                >
                  {preview.save.status === "completed" && (
                    <Button
                      onClick={() =>
                        setPreview({
                          ...preview,
                          save: start(
                            preview.story,
                            "preview",
                            "preview",
                            baseStats,
                            Date.now(),
                          ),
                        })
                      }
                    >
                      Play preview again
                    </Button>
                  )}
                </Page>
              </Story>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
