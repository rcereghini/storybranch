import { ConditionEditor } from "./ConditionEditor";
import { SavedPlaytestScenarios } from "./SavedPlaytestScenarios";
import { StoryItemCatalogue } from "./StoryItemCatalogue";
import { BranchItemsEditor } from "./BranchItemsEditor";
import { EarnedAccountKeys } from "./EarnedAccountKeys";
import { renderStoryNode } from "../../../packages/domain/player";
import { PromotionalKeyEditor } from "./PromotionalKeys";
import { Button } from "./ui";
import { PreviewKeys } from "./PreviewKeys";
import type { PreviewScenario } from "../../../packages/contracts/preview";
import {
  startPreview as simulatePreview,
  previewPreset,
} from "../../../packages/domain/preview";
import { useCallback, useEffect, useRef, useState } from "react";
import { createApi, ApiError } from "../../../packages/api-client/index";
import { z } from "zod";
import { choiceSchema, effectSchema } from "../../../packages/contracts/index";
import { auth } from "./firebase";
import {
  type Choice,
  type Story as StoryData,
  type StoryNode as StoryNodeData,
  type Save,
} from "../../../packages/contracts/index";
import {
  storyTrunkOf,
  type DraftRecord,
} from "../../../packages/contracts/authoring";
import type { AssistChoice } from "../../../packages/contracts/assist";
import {
  reviewPublication,
  validatePublication,
} from "../../../packages/domain/authoring";
import {
  baseStats,
  isResultStoryNode,
  transition,
} from "../../../packages/domain/index";
import { resolveFixtureMedia } from "../../../fixtures/media";
import { Story } from "./Story";
import { StoryNode } from "./StoryNode";
import { StoryLeafEditor } from "./StoryLeafEditor";
import { AchievementSubmission } from "./Achievements";
import { StoryProgressEditor } from "./StoryProgressEditor";
import { StoryKeyImports, StoryRunExports } from "./StoryKeyImports";
import { StoryInvitations } from "./StoryInvitations";
import { ClipPicker } from "./ClipPicker";
import { StoryNodeLibrary } from "./Library";
import { StoryGraph } from "./StoryGraph";
import { StoryOutline } from "./StoryOutline";
import { StoryNodeAssist, StoryNodeImageDialog } from "./StudioAssist";
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
import { connectStoryNode } from "../../../packages/domain/story-graph";
import {
  assetIdOf,
  assetRef,
  type ClipAsset,
  type UploadListing,
} from "../../../packages/contracts/media";
import {
  blankStory,
  starterStory,
  choice,
  comicTemplate,
  countToward,
  ending,
  makeStoryNode,
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
  "story" | "description" | "storyNodePositions" | "comic" | "playtestScenarios"
>;
type Request = { path: string; body: unknown; version: number };
type SaveState = "idle" | "saving" | "saved" | "error" | "conflict";
// Phone layout: which part of the editor fills the screen.
type View = "storyNodes" | "map" | "panel";
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
    scenario: PreviewScenario;
    session: number;
  } | null>(null);
  const [passRoll, setPassRoll] = useState(true);
  const [retry, setRetry] = useState<Request | null>(null);
  const [offline, setOffline] = useState(!navigator.onLine);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [focus, setFocus] = useState(0);
  const [view, setView] = useState<View>("storyNodes");
  const [back, setBack] = useState<View>("storyNodes");
  const [pane, setPane] = useState<"storyNode" | "story">("storyNode");
  const [side, setSide] = useState<"storyNodes" | "library">("storyNodes");
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
    storyNodePositions: d.storyNodePositions,
    comic: d.comic,
    playtestScenarios: d.playtestScenarios,
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
    if (!next.story.storyNodes[selected])
      setSelected(next.story.entryStoryNodeId);
  };
  const undo = () => restore(past, future);
  const redo = () => restore(future, past);
  const change = (story: StoryData) => {
    edit((d) => ({ ...d, story }));
    setNotice("");
  };
  const storyNode = draft?.story.storyNodes[selected];
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
  const updateStoryNode = (value: StoryNodeData) =>
    draft &&
    change({
      ...draft.story,
      storyNodes: { ...draft.story.storyNodes, [value.id]: value },
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
          storyNodePositions: Object.fromEntries(
            Object.entries(current.storyNodePositions ?? {}).filter(
              ([id]) => current.story.storyNodes[id],
            ),
          ),
          ...(current.comic ? { comic: current.comic } : {}),
          ...(current.playtestScenarios
            ? { playtestScenarios: current.playtestScenarios }
            : {}),
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
    setSelected(d.story.entryStoryNodeId);
    setDirty(isDirty);
    setPreview(null);
    setRetry(null);
    setSaveState(isDirty ? "idle" : "saved");
    past.current = [];
    future.current = [];
    editVersion.current++;
    savedVersion.current = isDirty ? -1 : editVersion.current;
    setView("panel");
    setPane("story");
    setFocus(0);
    setPanel(null);
    setCompanion(false);
    setComicMap(false);
    const shown = reopen.current;
    reopen.current = null;
    if (
      shown?.storyId === d.story.id &&
      d.story.storyNodes[shown.storyNodeId]
    ) {
      setSelected(shown.storyNodeId);
      setCompanion(true);
    }
  };
  // Opens the companion on a background drawing's comic, loading its draft
  // first when another one (or none) is open.
  const showDrawing = (shown: Drawing) => {
    if (draftRef.current?.story.id === shown.storyId) {
      setSelected(shown.storyNodeId);
      setComicMap(false);
      setPane("storyNode");
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
  const create = (kind: "story" | "starter" | "quiz" | "comic" = "story") => {
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
              : kind === "starter"
                ? starterStory(id)
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
      const scenario = previewPreset(story, "first");
      setPreview({
        story,
        scenario,
        session: Date.now(),
        save: simulatePreview(story, scenario, Date.now()),
      });
      setNotice("");
    } catch (e) {
      setNotice((e as Error).message);
    }
  };
  // Selecting a StoryNode edits it: on a phone the settings fill the screen.
  const select = (id: string, from: View) => {
    setSelected(id);
    setPane("storyNode");
    setBack(from);
    setView("panel");
    if (from !== "map") setFocus((f) => f + 1);
  };

  const setType = (type: StoryNodeData["storyNodeType"]) => {
    if (!storyNode || !draft) return;
    const {
      video: _,
      videoAdvance: _advance,
      sourceStoryNode: _source,
      comic: _comic,
      ...rest
    } = storyNode;
    if (type === "comic") {
      // Panels replace the StoryNode photo; the StoryNode keeps its one output.
      const { image: _image, ...plain } = rest;
      updateStoryNode({
        ...plain,
        storyNodeType: type,
        comic: storyNode.comic ?? newComic(),
        choices: storyNode.kind === "ending" ? [] : [choice()],
      });
      return;
    }
    if (type === "reveal") {
      // A reveal needs at least two results; start with two new endings.
      const ids = [`result-${shortId()}`, `result-${shortId()}`];
      change({
        ...draft.story,
        storyNodes: {
          ...draft.story.storyNodes,
          ...Object.fromEntries(
            ids.map((r, i) => [
              r,
              ending(r, `Result ${i + 1}`, "Describe this result."),
            ]),
          ),
          [storyNode.id]: {
            ...rest,
            storyNodeType: type,
            kind: "scene",
            leaf: undefined,
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
    updateStoryNode({
      ...rest,
      storyNodeType: type,
      kind: type === "dice" ? "scene" : storyNode.kind,
      ...(type === "dice" ? { leaf: undefined } : {}),
      ...(type.startsWith("video") ? { video: media[0].landscape.src } : {}),
      choices: storyNode.kind === "ending" && type !== "dice" ? [] : [c],
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
        {!draft?.story.storyNodes[target] && (
          <option value={target}>Not connected</option>
        )}
        {draft &&
          Object.values(draft.story.storyNodes).map((p) => (
            <option key={p.id} value={p.id}>
              {p.title} ({p.id})
            </option>
          ))}
      </select>
    </label>
  );
  // Results come from the story's reveal StoryNodes, named by their StoryNode titles.
  const quizResults = draft
    ? Object.values(draft.story.storyNodes).flatMap((p) =>
        p.choices.flatMap((c) =>
          c.outcome.kind === "reveal" ? c.outcome.results : [],
        ),
      )
    : [];
  const editChoice = (index: number, c: Choice) =>
    storyNode &&
    updateStoryNode({
      ...storyNode,
      choices: storyNode.choices.map((old, i) => (i === index ? c : old)),
    });
  const addGraphStoryNode = (
    type: "text" | "text-options" | "video" | "video-options" | "ending",
    branch = false,
  ) => {
    if (!draft || Object.keys(draft.story.storyNodes).length >= 80) return;
    const id = `story-node-${shortId()}`;
    const target =
      Object.values(draft.story.storyNodes).find((p) => p.kind === "ending")
        ?.id ?? draft.story.entryStoryNodeId;
    const linear =
      storyNode?.choices.length === 1 &&
      storyNode.choices[0].outcome.kind === "direct" &&
      !storyNode.storyNodeType.endsWith("options");
    const next =
      linear && !branch && storyNode.choices[0].outcome.kind === "direct"
        ? storyNode.choices[0].outcome.route.targetStoryNodeId
        : target;
    const added: StoryNodeData = {
      ...makeStoryNode(id),
      title: type === "ending" ? "New ending" : "New StoryNode",
      storyNodeType: type === "ending" ? "text" : type,
      kind: type === "ending" ? "ending" : "scene",
      choices: type === "ending" ? [] : [choice(next)],
      ...(type.startsWith("video") ? { video: media[0].landscape.src } : {}),
    };
    let story = {
      ...draft.story,
      storyNodes: { ...draft.story.storyNodes, [id]: added },
    };
    if (branch && storyNode) {
      const {
        sourceStoryNode: _source,
        videoAdvance: _advance,
        ...rest
      } = storyNode;
      story.storyNodes[storyNode.id] = {
        ...rest,
        storyNodeType: storyNode.storyNodeType.startsWith("video")
          ? "video-options"
          : "text-options",
        choices: [
          ...storyNode.choices,
          { ...choice(id), label: `Option ${storyNode.choices.length + 1}` },
        ],
      };
    } else if (linear && storyNode)
      story = connectStoryNode(
        story,
        storyNode.id,
        { choiceId: storyNode.choices[0].id, slot: 0 },
        id,
      );
    if (Object.keys(draft.story.storyNodes).length === 0)
      story.entryStoryNodeId = id;
    change(story);
    setSelected(id);
    setPane("storyNode");
    setFocus((f) => f + 1);
    setPreview(null);
  };
  // Accepted AI choices: each becomes an option leading to a new StoryNode that
  // continues where this StoryNode's single output went (or to an ending).
  const addSuggestedChoices = (suggested: AssistChoice[]) => {
    if (!draft || !storyNode) return;
    const room = 80 - Object.keys(draft.story.storyNodes).length;
    const picks = suggested.slice(0, Math.max(0, room));
    if (!picks.length) {
      setNotice("This story has the most StoryNodes it can hold (80).");
      return;
    }
    const fallback =
      Object.values(draft.story.storyNodes).find((p) => p.kind === "ending")
        ?.id ?? draft.story.entryStoryNodeId;
    const onward =
      storyNode.choices.length === 1 &&
      storyNode.choices[0].outcome.kind === "direct"
        ? storyNode.choices[0].outcome.route.targetStoryNodeId
        : fallback;
    const created = picks.map((pick) => ({
      ...makeStoryNode(`story-node-${shortId()}`),
      title: pick.title,
      transcript: pick.text || "What happens here?",
      choices: [choice(onward)],
    }));
    const {
      sourceStoryNode: _source,
      videoAdvance: _advance,
      ...rest
    } = storyNode;
    // A plain StoryNode becomes an options StoryNode; its old "Continue" is replaced.
    const keep = storyNode.storyNodeType.endsWith("options")
      ? storyNode.choices
      : [];
    change({
      ...draft.story,
      storyNodes: {
        ...draft.story.storyNodes,
        ...Object.fromEntries(created.map((p) => [p.id, p])),
        [storyNode.id]: {
          ...rest,
          storyNodeType: storyNode.storyNodeType.startsWith("video")
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
              onClick={() => create("starter")}
            >
              New starter story
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
              A story is a set of StoryNodes linked by choices: text, video,
              dice rolls, quiz results and comics. Start from a blank story, a
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
  const comicView =
    !!draft.comic && storyNode?.storyNodeType === "comic" && !comicMap;
  const canUndo = past.current.length > 0;
  const canRedo = future.current.length > 0;
  const publication = reviewPublication(draft.story);
  const trunk = storyTrunkOf(draft);
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
            ["storyNodes", "StoryNodes"],
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
          {pane === "story" ? "StoryTrunk" : "Edit StoryNode"}
        </button>
      </nav>

      <div className="studio-body">
        <aside className="studio-side" aria-label="StoryNodes and library">
          <div className="studio-tabs" role="group" aria-label="Side panel">
            <button
              aria-pressed={side === "storyNodes"}
              onClick={() => setSide("storyNodes")}
            >
              StoryNodes
            </button>
            <button
              aria-pressed={side === "library"}
              onClick={() => setSide("library")}
            >
              Library
            </button>
          </div>
          <div className="studio-scroll">
            {side === "storyNodes" ? (
              <>
                <StoryOutline
                  story={draft.story}
                  selected={selected}
                  onSelect={(id) => select(id, "storyNodes")}
                />
                <Button
                  className="btn btn-secondary btn-small studio-story-link"
                  onClick={() => {
                    setPane("story");
                    setBack("storyNodes");
                    setView("panel");
                  }}
                >
                  StoryTrunk
                </Button>
              </>
            ) : (
              <StoryNodeLibrary
                api={api}
                uploads={uploads}
                storyNode={storyNode}
                disabled={
                  busy || Object.keys(draft.story.storyNodes).length >= 80
                }
                key={draft.story.id}
                onSaved={(record, instanceId) => {
                  edit((current) => {
                    const instance = current.story.storyNodes[instanceId];
                    if (!instance) return current;
                    return {
                      ...current,
                      story: {
                        ...current.story,
                        storyNodes: {
                          ...current.story.storyNodes,
                          [instanceId]: {
                            ...instance,
                            sourceStoryNode: {
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
                  const target = Object.values(draft.story.storyNodes).find(
                    (p) => p.kind === "ending",
                  )?.id;
                  if (!target) {
                    setNotice(
                      "Add an ending before placing a reusable StoryNode.",
                    );
                    return;
                  }
                  instance.choices = instance.choices.map((c) => ({
                    ...c,
                    outcome: { kind: "direct", route: route(target) },
                  }));
                  change({
                    ...draft.story,
                    storyNodes: {
                      ...draft.story.storyNodes,
                      [instance.id]: instance,
                    },
                  });
                  setSelected(instance.id);
                  setFocus((f) => f + 1);
                }}
              />
            )}
          </div>
        </aside>

        <div className={`studio-canvas${draft.comic ? " is-comic" : ""}`}>
          {draft.comic && comicMap && storyNode?.storyNodeType === "comic" && (
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
          {comicView && storyNode ? (
            <ComicWorkspace
              storyNode={storyNode}
              uploads={uploads}
              selectedPanel={panel}
              onSelectPanel={(id) => {
                setPanel(id);
                setPane("storyNode");
                setBack("map");
                setView("panel");
              }}
              onShowMap={() => setComicMap(true)}
            />
          ) : (
            <StoryGraph
              key={draft.story.id}
              story={draft.story}
              positions={draft.storyNodePositions}
              selected={selected}
              disabled={busy}
              focus={focus}
              onSelect={(id) => select(id, "map")}
              onMove={(storyNodePositions) =>
                edit((current) => ({ ...current, storyNodePositions }))
              }
              onConnect={(source, edge, target) => {
                try {
                  change(connectStoryNode(draft.story, source, edge, target));
                  setPreview(null);
                } catch (e) {
                  setNotice((e as Error).message);
                }
              }}
              onAdd={(type) => addGraphStoryNode(type)}
              onBranch={() => addGraphStoryNode("text", true)}
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
              aria-pressed={pane === "storyNode"}
              onClick={() => setPane("storyNode")}
            >
              StoryNode
            </button>
            <button
              aria-pressed={pane === "story"}
              onClick={() => setPane("story")}
            >
              StoryTrunk
            </button>
          </div>
          <div className="studio-scroll">
            {pane === "story" ? (
              <fieldset className="studio-story-settings" disabled={busy}>
                <legend>StoryTrunk</legend>
                <p>
                  The title and configuration root of your Story. The
                  playthrough starts at its first StoryNode.
                </p>
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
                  "First StoryNode",
                  draft.story.entryStoryNodeId,
                  (entryStoryNodeId) =>
                    change({ ...draft.story, entryStoryNodeId }),
                )}
                <label>
                  Starting keys
                  <input
                    aria-label="Starting keys"
                    placeholder="brass-key, invitation"
                    key={`${draft.story.id}-${(draft.story.trunkContext?.initialKeys ?? []).join(",")}`}
                    defaultValue={trunk.context.initialKeys
                      .map((key) => key.slice(draft.story.id.length + 1))
                      .join(", ")}
                    onBlur={(e) =>
                      change({
                        ...draft.story,
                        trunkContext: {
                          version: 1,
                          initialKeys: e.target.value
                            .split(",")
                            .map((key) => key.trim())
                            .filter(Boolean)
                            .map((key) => `${draft.story.id}:${key}`),
                        },
                      })
                    }
                  />
                </label>
                <p>
                  Local to each new run. Use lowercase names with hyphens; these
                  keys cannot grant account access.
                </p>
                <StoryItemCatalogue
                  key={draft.story.id}
                  story={draft.story}
                  onChange={change}
                />
                <StoryProgressEditor story={draft.story} onChange={change} />
                <PromotionalKeyEditor
                  key={draft.story.id}
                  api={api}
                  story={draft.story}
                  onChange={change}
                />
                <EarnedAccountKeys
                  key={draft.story.id}
                  api={api}
                  story={draft.story}
                  onChange={change}
                />
                <StoryKeyImports story={draft.story} onChange={change} />
                <StoryRunExports story={draft.story} onChange={change} />
                {draft.revision > 0 && (
                  <StoryInvitations
                    key={`${draft.story.id}-${!!draft.publishedVersionId}`}
                    api={api}
                    storyId={draft.story.id}
                    notify={setNotice}
                  />
                )}
                {Object.keys(draft.story.storyNodes).length === 0 && (
                  <p>
                    Your Story is blank. Open Map to add a StoryNode or
                    StoryLeaf.
                  </p>
                )}
                <section aria-label="Publication review">
                  <h3>Playable paths</h3>
                  <p>
                    {publication.error ??
                      "A safe starting path is ready for preview and publication."}
                  </p>
                  {publication.diagnostics.length > 0 && (
                    <>
                      <p>
                        These paths stay in your draft and are omitted from
                        play:
                      </p>
                      <ul>
                        {publication.diagnostics.map((issue, i) => (
                          <li key={i}>
                            {issue.storyNodeId &&
                              `${draft.story.storyNodes[issue.storyNodeId]?.title ?? issue.storyNodeId}: `}
                            {issue.message}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </section>
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
              <fieldset className="studio-story-node-inspector" disabled={busy}>
                <legend>StoryNode settings</legend>
                <label>
                  Edit StoryNode
                  <select
                    aria-label="Edit StoryNode"
                    value={selected}
                    onChange={(e) => {
                      setSelected(e.target.value);
                      setFocus((f) => f + 1);
                      setPreview(null);
                    }}
                  >
                    {Object.values(draft.story.storyNodes).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title} ({p.id})
                      </option>
                    ))}
                  </select>
                </label>
                {storyNode && (
                  <>
                    <label>
                      StoryNode title
                      <input
                        maxLength={160}
                        value={storyNode.title}
                        onChange={(e) =>
                          updateStoryNode({
                            ...storyNode,
                            title: e.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      StoryNode type
                      <select
                        aria-label="StoryNode type"
                        value={storyNode.storyNodeType}
                        onChange={(e) =>
                          setType(
                            e.target.value as StoryNodeData["storyNodeType"],
                          )
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
                    <StoryNodeAssist
                      api={api}
                      story={draft.story}
                      description={draft.description}
                      storyNode={storyNode}
                      reason={assistReason}
                      onText={(transcript) =>
                        updateStoryNode({ ...storyNode, transcript })
                      }
                      onChoices={addSuggestedChoices}
                    >
                      <label>
                        Text / transcript
                        <textarea
                          aria-label="Text / transcript"
                          rows={8}
                          maxLength={10000}
                          value={storyNode.transcript}
                          onChange={(e) =>
                            updateStoryNode({
                              ...storyNode,
                              transcript: e.target.value,
                            })
                          }
                        />
                      </label>
                    </StoryNodeAssist>
                    {storyNode.storyNodeType.startsWith("video") && (
                      <ClipPicker
                        api={api}
                        value={storyNode.video}
                        uploads={uploads}
                        disabled={busy}
                        onChange={(video) =>
                          updateStoryNode({ ...storyNode, video })
                        }
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
                    {storyNode.storyNodeType === "video" && (
                      <label>
                        After the video ends
                        <select
                          aria-label="After the video ends"
                          value={storyNode.videoAdvance ?? "auto"}
                          onChange={(e) =>
                            updateStoryNode({
                              ...storyNode,
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
                    {storyNode.storyNodeType === "comic" ? (
                      <ComicEditor
                        api={api}
                        draft={draft}
                        storyNode={storyNode}
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
                          value={storyNode.image}
                          uploads={uploads}
                          disabled={busy}
                          onChange={(image) => {
                            const { image: _, ...rest } = storyNode;
                            updateStoryNode(image ? { ...rest, image } : rest);
                          }}
                          onUploaded={addUpload}
                        />
                        <button
                          className="assist-button studio-image-button"
                          disabled={busy}
                          onClick={() => setImageDialog(true)}
                        >
                          ✦ Generate a StoryNode image
                        </button>
                      </>
                    )}
                    {storyNode.sourceStoryNode && (
                      <p>
                        Library revision {storyNode.sourceStoryNode.revision}.
                        Save content edits to the library before publishing;
                        story routes stay separate.
                      </p>
                    )}
                    {storyNode.storyNodeType !== "dice" &&
                      storyNode.storyNodeType !== "reveal" && (
                        <label>
                          <input
                            type="checkbox"
                            checked={storyNode.kind === "ending"}
                            onChange={(e) =>
                              updateStoryNode({
                                ...storyNode,
                                kind: e.target.checked ? "ending" : "scene",
                                leaf: e.target.checked
                                  ? storyNode.leaf
                                  : undefined,
                                choices: e.target.checked ? [] : [choice()],
                              })
                            }
                          />{" "}
                          End this story here
                        </label>
                      )}
                    <h3>Outputs</h3>
                    {storyNode.kind === "ending" && (
                      <StoryLeafEditor
                        storyId={draft.story.id}
                        node={storyNode}
                        onChange={updateStoryNode}
                      />
                    )}
                    {storyNode.kind === "ending" &&
                      draft.publishedVersionId && (
                        <AchievementSubmission
                          key={`${draft.story.id}-${draft.publishedVersionId}-${storyNode.id}`}
                          api={api}
                          storyId={draft.story.id}
                          versionId={draft.publishedVersionId}
                          storyNodeId={storyNode.id}
                          notify={setNotice}
                        />
                      )}
                    {storyNode.kind === "ending" && (
                      <p>
                        This closes the story and offers replay or another
                        adventure.
                      </p>
                    )}
                    {storyNode.choices.map((c, i) => (
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
                            "Next",
                            c.outcome.route.targetStoryNodeId,
                            (target) =>
                              editChoice(i, {
                                ...c,
                                outcome: {
                                  kind: "direct",
                                  route: {
                                    ...(c.outcome.kind === "direct"
                                      ? c.outcome.route
                                      : route(target)),
                                    targetStoryNodeId: target,
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
                              "Pass StoryNode",
                              c.outcome.success.targetStoryNodeId,
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
                              "Fail StoryNode",
                              c.outcome.failure.targetStoryNodeId,
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
                                  `Result ${j + 1} StoryNode`,
                                  r.route.targetStoryNodeId,
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
                                Object.keys(draft.story.storyNodes).length >= 80
                              }
                              onClick={() => {
                                if (c.outcome.kind !== "reveal") return;
                                const id = `result-${shortId()}`;
                                change({
                                  ...draft.story,
                                  storyNodes: {
                                    ...draft.story.storyNodes,
                                    [id]: ending(
                                      id,
                                      `Result ${c.outcome.results.length + 1}`,
                                      "Describe this result.",
                                    ),
                                    [storyNode.id]: {
                                      ...storyNode,
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
                                    {draft.story.storyNodes[
                                      r.route.targetStoryNodeId
                                    ]?.title ?? r.route.targetStoryNodeId}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}
                        {storyNode.storyNodeType.endsWith("options") && (
                          <label>
                            Key required
                            <select
                              aria-label={`Option ${i + 1} persistent key`}
                              value={
                                !c.availableWhen
                                  ? ""
                                  : c.availableWhen.kind === "key" &&
                                      (c.availableWhen.scope === "story" ||
                                        c.availableWhen.scope === "import" ||
                                        c.availableWhen.scope === "account") &&
                                      c.availableWhen.present
                                    ? `${c.availableWhen.scope}|${c.availableWhen.keyId}`
                                    : "advanced"
                              }
                              onChange={(e) => {
                                const { availableWhen: _, ...rest } = c;
                                editChoice(
                                  i,
                                  e.target.value
                                    ? {
                                        ...rest,
                                        availableWhen: {
                                          kind: "key",
                                          scope: e.target.value.startsWith(
                                            "import|",
                                          )
                                            ? "import"
                                            : e.target.value.startsWith(
                                                  "account|",
                                                )
                                              ? "account"
                                              : "story",
                                          keyId: e.target.value.split("|")[1],
                                          present: true,
                                        },
                                        unavailableDisplay: "hidden",
                                      }
                                    : rest,
                                );
                              }}
                            >
                              <option value="">No condition</option>
                              <option value="advanced" disabled>
                                Advanced condition (see JSON)
                              </option>
                              {(draft.story.progression?.keys ?? []).map(
                                (k) => (
                                  <option
                                    key={k.keyId}
                                    value={`story|${k.keyId}`}
                                  >
                                    {k.label}
                                  </option>
                                ),
                              )}
                              {(draft.story.accountKeys?.keys ?? []).map(
                                (k) => (
                                  <option
                                    key={`account-${k.keyId}`}
                                    value={`account|${k.keyId}`}
                                  >
                                    {k.label} (
                                    {k.source === "achievement"
                                      ? "earned account"
                                      : "promotional"}
                                    )
                                  </option>
                                ),
                              )}
                              {(draft.story.keyImports?.keys ?? []).map((k) => (
                                <option
                                  key={`import-${k.keyId}`}
                                  value={`import|${k.keyId}`}
                                >
                                  {k.label} (imported)
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                        <BranchItemsEditor
                          key={`${storyNode.id}-${c.id}-items`}
                          story={draft.story}
                          choice={c}
                          option={i + 1}
                          onApply={(next) => editChoice(i, next)}
                        />
                        {storyNode.storyNodeType.endsWith("options") && (
                          <ConditionEditor
                            key={storyNode.id + c.id}
                            story={draft.story}
                            value={c.availableWhen}
                            option={i + 1}
                            onApply={(condition) => {
                              const { availableWhen: _, ...rest } = c;
                              editChoice(
                                i,
                                condition
                                  ? {
                                      ...rest,
                                      availableWhen: condition,
                                      unavailableDisplay: c.availableWhen
                                        ? c.unavailableDisplay
                                        : "hidden",
                                    }
                                  : rest,
                              );
                            }}
                          />
                        )}
                        {storyNode.storyNodeType.endsWith("options") && (
                          <Button
                            onClick={() =>
                              updateStoryNode({
                                ...storyNode,
                                choices: storyNode.choices.filter(
                                  (_, j) => j !== i,
                                ),
                              })
                            }
                          >
                            Remove option {i + 1}
                          </Button>
                        )}
                      </div>
                    ))}
                    {storyNode.kind !== "ending" &&
                      storyNode.storyNodeType.endsWith("options") && (
                        <Button
                          disabled={storyNode.choices.length >= 20}
                          onClick={() =>
                            updateStoryNode({
                              ...storyNode,
                              choices: [...storyNode.choices, choice()],
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
                          key={`${storyNode.id}-choices-${JSON.stringify(storyNode.choices)}`}
                          aria-label="Outputs JSON"
                          rows={8}
                          defaultValue={JSON.stringify(
                            storyNode.choices,
                            null,
                            2,
                          )}
                          onBlur={(e) => {
                            try {
                              const choices = z
                                .array(choiceSchema)
                                .max(20)
                                .parse(JSON.parse(e.target.value));
                              updateStoryNode({ ...storyNode, choices });
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
                          key={`${storyNode.id}-effects`}
                          aria-label="Entry effects JSON"
                          rows={4}
                          defaultValue={JSON.stringify(
                            storyNode.entryEffects,
                            null,
                            2,
                          )}
                          onBlur={(e) => {
                            try {
                              updateStoryNode({
                                ...storyNode,
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
                      disabled={storyNode.id === draft.story.entryStoryNodeId}
                      onClick={() => {
                        const storyNodes = { ...draft.story.storyNodes };
                        delete storyNodes[storyNode.id];
                        change({ ...draft.story, storyNodes });
                        setSelected(draft.story.entryStoryNodeId);
                      }}
                    >
                      Delete StoryNode
                    </Button>
                  </>
                )}
              </fieldset>
            )}
          </div>
        </aside>
      </div>

      {imageDialog && storyNode && (
        <StoryNodeImageDialog
          api={api}
          story={draft.story}
          description={draft.description}
          storyNode={storyNode}
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
            const current = draftRef.current?.story.storyNodes[storyNode.id];
            if (current)
              updateStoryNode({ ...current, image: assetRef(asset.id) });
            setNotice("Image generated and placed on this StoryNode.");
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
              <SavedPlaytestScenarios
                story={preview.story}
                current={preview.scenario}
                entries={draft.playtestScenarios ?? []}
                onChange={(playtestScenarios) =>
                  edit((current) => ({ ...current, playtestScenarios }))
                }
                onLoad={(scenario) =>
                  setPreview({
                    ...preview,
                    scenario,
                    session: preview.session + 1,
                    save: simulatePreview(preview.story, scenario, Date.now()),
                  })
                }
              />
              <PreviewKeys
                story={preview.story}
                save={preview.save}
                scenario={preview.scenario}
                onRestart={(scenario) =>
                  setPreview({
                    ...preview,
                    scenario,
                    session: preview.session + 1,
                    save: simulatePreview(preview.story, scenario, Date.now()),
                  })
                }
              />
              <Story
                key={preview.session}
                story={preview.story}
                save={preview.save}
                user={{
                  id: "preview",
                  stats: baseStats,
                  achievements: [],
                  saveSpots: [],
                }}
              >
                <StoryNode
                  storyNode={renderStoryNode(
                    preview.story.storyNodes[preview.save.storyNodeId],
                    preview.save,
                    preview.scenario.accountKeys,
                    preview.story.itemCatalogue,
                  )}
                  result={isResultStoryNode(
                    preview.story,
                    preview.save.storyNodeId,
                  )}
                  media={mediaFor(
                    preview.story.storyNodes[preview.save.storyNodeId].video,
                  )}
                  image={
                    uploads?.items.find(
                      (a) =>
                        a.id ===
                        assetIdOf(
                          preview.story.storyNodes[preview.save.storyNodeId]
                            .image,
                        ),
                    )?.url
                  }
                  panels={(() => {
                    const comic =
                      preview.story.storyNodes[preview.save.storyNodeId].comic;
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
                        preview.scenario.accountKeys,
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
                          session: preview.session + 1,
                          save: simulatePreview(
                            preview.story,
                            preview.scenario,
                            Date.now(),
                          ),
                        })
                      }
                    >
                      Play preview again
                    </Button>
                  )}
                </StoryNode>
              </Story>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
