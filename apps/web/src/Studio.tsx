import { Button } from "./ui";
import { useEffect, useState } from "react";
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
import { validatePublication } from "../../../packages/domain/authoring";
import {
  baseStats,
  isResultPage,
  start,
  transition,
} from "../../../packages/domain/index";
import { sceneMedia, resolveFixtureMedia } from "../../../fixtures/media";
import { Story } from "./Story";
import { Page } from "./Page";
import { ClipPicker } from "./ClipPicker";
import { PageLibrary } from "./Library";
import { StoryGraph } from "./StoryGraph";
import { connectPage } from "../../../packages/domain/story-graph";
import {
  assetIdOf,
  type UploadListing,
} from "../../../packages/contracts/media";

const api = createApi(
  fetch,
  async () => auth.currentUser?.getIdToken() ?? null,
);
const route = (targetPageId: string) => ({ targetPageId, effects: [] });
const choice = (target = "ending"): Choice => ({
  id: crypto.randomUUID(),
  label: "Continue",
  unavailableDisplay: "locked",
  costs: [],
  outcome: { kind: "direct", route: route(target) },
});
const makePage = (id: string): StoryPage => ({
  id,
  title: "New page",
  transcript: "What happens here?",
  kind: "scene",
  pageType: "text",
  entryEffects: [],
  choices: [choice()],
});
const media = Object.values(sceneMedia);
const shortId = () => crypto.randomUUID().slice(0, 8);
const ending = (id: string, title: string, transcript: string): StoryPage => ({
  ...makePage(id),
  title,
  transcript,
  kind: "ending",
  choices: [],
});
type Results = Extract<Choice["outcome"], { kind: "reveal" }>["results"];
const result = (storyId: string, pageId: string): Results[number] => ({
  scoreId: `${storyId}:${pageId}`,
  route: route(pageId),
});
const revealChoice = (results: Results): Choice => ({
  ...choice(),
  label: "Reveal my result",
  outcome: { kind: "reveal", results },
});
// An answer counts toward at most one result, through a score effect.
const scoreOf = (c: Choice) =>
  c.outcome.kind === "direct"
    ? c.outcome.route.effects.find((e) => e.kind === "score")?.scoreId
    : undefined;
const countToward = (c: Choice, scoreId?: string): Choice =>
  c.outcome.kind !== "direct"
    ? c
    : {
        ...c,
        outcome: {
          kind: "direct",
          route: {
            ...c.outcome.route,
            effects: [
              ...c.outcome.route.effects.filter((e) => e.kind !== "score"),
              ...(scoreId
                ? [
                    {
                      id: `score-${c.id}`,
                      kind: "score" as const,
                      scoreId,
                      delta: 1,
                    },
                  ]
                : []),
            ],
          },
        },
      };
// A starter quiz: two questions whose answers each add a point toward one of
// three results, then a reveal page that shows the winning result.
function quizTemplate(id: string): StoryData {
  const results = ["result-a", "result-b", "result-c"];
  const names = ["The Explorer", "The Builder", "The Dreamer"];
  const question = (
    pageId: string,
    title: string,
    labels: string[],
    target: string,
  ): StoryPage => ({
    ...makePage(pageId),
    title,
    transcript: "Pick the answer that fits you best.",
    pageType: "text-options",
    choices: labels.map((label, i) =>
      countToward({ ...choice(target), label }, `${id}:${results[i]}`),
    ),
  });
  return {
    id,
    versionId: "draft",
    rulesetVersion: "prototype-1",
    title: "Untitled quiz",
    entryPageId: "opening",
    pages: {
      opening: {
        ...makePage("opening"),
        title: "Opening",
        transcript: "Answer a few questions to find out which one you are.",
        choices: [{ ...choice("question-1"), label: "Start the quiz" }],
      },
      "question-1": question(
        "question-1",
        "Question 1",
        ["Go somewhere new", "Make something", "Daydream"],
        "question-2",
      ),
      "question-2": question(
        "question-2",
        "Question 2",
        ["A map", "A toolbox", "A notebook"],
        "reveal",
      ),
      reveal: {
        ...makePage("reveal"),
        title: "Your answers are in",
        transcript: "Ready to see your result?",
        pageType: "reveal",
        choices: [revealChoice(results.map((r) => result(id, r)))],
      },
      ...Object.fromEntries(
        results.map((r, i) => [
          r,
          ending(
            r,
            names[i],
            "Describe this result and what it says about you.",
          ),
        ]),
      ),
    },
  };
}
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

export function Studio({
  onPlay,
  onDirtyChange,
}: {
  onPlay: (id: string) => void;
  onDirtyChange: (dirty: boolean) => void;
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
  const [retry, setRetry] = useState<{ path: string; body: unknown } | null>(
    null,
  );
  const [offline, setOffline] = useState(!navigator.onLine);
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
  const change = (story: StoryData) => {
    setDraft((d) => d && { ...d, story });
    setDirty(true);
    setNotice("");
  };
  const page = draft?.story.pages[selected];
  const updatePage = (value: StoryPage) =>
    draft &&
    change({
      ...draft.story,
      pages: { ...draft.story.pages, [value.id]: value },
    });
  const send = async (request: { path: string; body: unknown }) => {
    setRetry(request);
    let result: DraftRecord;
    try {
      result = await api<DraftRecord>(request.path, request.body);
    } catch (error) {
      if (error instanceof ApiError && error.code !== "UNAVAILABLE")
        setRetry(null);
      throw error;
    }
    setDraft(result);
    setDirty(false);
    setRetry(null);
    setNotice(
      request.path.endsWith("/publish")
        ? `Published ${result.publishedVersionId}. Your story is now in Discover.`
        : "Draft saved privately.",
    );
    await loadList();
  };
  const open = (id: string) =>
    void work(async () => {
      const d = await api<DraftRecord>(`/studio/${id}`);
      setDraft(d);
      setSelected(d.story.entryPageId);
      setDirty(false);
      setPreview(null);
      setRetry(null);
    });
  const create = (quiz = false) => {
    const id = `story-${crypto.randomUUID()}`;
    setDraft({
      revision: 0,
      publishedVersionId: null,
      description: "",
      story: quiz
        ? quizTemplate(id)
        : {
            id,
            versionId: "draft",
            rulesetVersion: "prototype-1",
            title: "Untitled story",
            entryPageId: "opening",
            pages: {
              opening: { ...makePage("opening"), title: "Opening" },
              ending: {
                ...makePage("ending"),
                title: "The end",
                kind: "ending",
                choices: [],
              },
            },
          },
    });
    setSelected("opening");
    setDirty(true);
    setNotice("");
    setPreview(null);
  };
  const setType = (type: StoryPage["pageType"]) => {
    if (!page || !draft) return;
    const {
      video: _,
      videoAdvance: _advance,
      sourcePage: _source,
      ...rest
    } = page;
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
    setPreview(null);
  };
  return (
    <section className="studio">
      <div className="section-heading">
        <div>
          <p className="eyebrow">CREATOR STUDIO · ALPHA</p>
          <h1>Build your next world.</h1>
        </div>
        <div className="studio-actions">
          <Button disabled={busy || dirty || !!retry} onClick={() => create()}>
            New story
          </Button>
          <Button
            disabled={busy || dirty || !!retry}
            onClick={() => create(true)}
          >
            New quiz
          </Button>
        </div>
      </div>
      <p>
        Save a private draft, connect its pages, preview the journey, then
        publish an edition. Existing players keep their original edition.
      </p>
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
      {!listing && !busy && (
        <Button onClick={() => void work(() => loadList())}>
          Retry loading drafts
        </Button>
      )}
      {listing && !listing.canPublish && (
        <p>
          Publishing is invite-only during alpha. Drafts and previews are
          available; ask the Storybranch team to turn on publishing for your
          account.
        </p>
      )}
      <div className="studio-layout">
        <aside className="studio-library">
          <h2>Your drafts</h2>
          <div className="studio-draft-stack">
            {listing?.items.map((d) => (
              <Button
                key={d.id}
                className="studio-draft-card"
                aria-current={draft?.story.id === d.id ? "true" : undefined}
                disabled={busy || dirty || !!retry}
                onClick={() => open(d.id)}
              >
                <span className="studio-draft-title" title={d.title}>
                  {d.title}
                </span>
                <small>{d.publishedVersionId ?? "Private draft"}</small>
              </Button>
            ))}
          </div>
          {listing?.nextCursor && (
            <Button
              disabled={busy}
              onClick={() => void work(() => loadList(listing.nextCursor!))}
            >
              More drafts
            </Button>
          )}
          {!listing?.items.length && (
            <p>Create your first story to get started.</p>
          )}
        </aside>
        {draft && (
          <div className="studio-editor">
            <div className="studio-actions">
              <Button
                disabled={busy || offline || !!retry}
                onClick={() =>
                  void work(() =>
                    send({
                      path: `/studio/${draft.story.id}`,
                      body: {
                        idempotencyKey: crypto.randomUUID(),
                        expectedRevision: draft.revision,
                        draft: {
                          story: draft.story,
                          description: draft.description,
                          pagePositions: Object.fromEntries(
                            Object.entries(draft.pagePositions ?? {}).filter(
                              ([id]) => draft.story.pages[id],
                            ),
                          ),
                        },
                      },
                    }),
                  )
                }
              >
                Save draft
              </Button>
              <Button
                disabled={busy || !!retry}
                onClick={() => {
                  try {
                    const story = validatePublication(draft.story);
                    setPreview({
                      story,
                      save: start(
                        story,
                        "preview",
                        "preview",
                        baseStats,
                        Date.now(),
                      ),
                    });
                    setNotice("");
                  } catch (e) {
                    setNotice((e as Error).message);
                  }
                }}
              >
                Preview
              </Button>
              <Button
                disabled={
                  busy ||
                  offline ||
                  dirty ||
                  !draft.revision ||
                  !listing?.canPublish ||
                  !!retry
                }
                onClick={() =>
                  void work(() =>
                    send({
                      path: `/studio/${draft.story.id}/publish`,
                      body: {
                        idempotencyKey: crypto.randomUUID(),
                        expectedRevision: draft.revision,
                        policyVersion: "creator-alpha-1",
                      },
                    }),
                  )
                }
              >
                Publish edition
              </Button>
              {draft.publishedVersionId && (
                <Button
                  disabled={busy || dirty || !!retry}
                  onClick={() => onPlay(draft.story.id)}
                >
                  Play published story
                </Button>
              )}
              <span>
                {dirty ? "Unsaved changes" : `Saved revision ${draft.revision}`}
              </span>
              {draft.revision > 0 && (
                <Button
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
              {retry && (
                <Button
                  disabled={busy || offline}
                  onClick={() => void work(() => send(retry))}
                >
                  Retry same request
                </Button>
              )}
            </div>
            <p className="muted">
              Publish makes this story public in Discover. Only publish content
              you have rights to share. Sample clips are placeholders. Uploaded
              clips become public when you publish a story that uses them.
            </p>
            <fieldset
              className="studio-story-settings"
              disabled={busy || !!retry}
            >
              <label>
                Story title
                <input
                  maxLength={160}
                  value={draft.story.title}
                  onChange={(e) =>
                    change({ ...draft.story, title: e.target.value })
                  }
                />
              </label>
              <label>
                Description
                <textarea
                  aria-label="Description"
                  maxLength={500}
                  value={draft.description}
                  onChange={(e) => {
                    setDraft({ ...draft, description: e.target.value });
                    setDirty(true);
                  }}
                />
              </label>
              {targetSelect(
                "First page",
                draft.story.entryPageId,
                (entryPageId) => change({ ...draft.story, entryPageId }),
              )}
            </fieldset>
            <div className="studio-workspace">
              <StoryGraph
                key={draft.story.id}
                story={draft.story}
                positions={draft.pagePositions}
                selected={selected}
                disabled={busy || !!retry}
                onSelect={(id) => {
                  setSelected(id);
                  setPreview(null);
                }}
                onMove={(pagePositions) => {
                  setDraft(
                    (current) => current && { ...current, pagePositions },
                  );
                  setDirty(true);
                }}
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
              <fieldset
                className="studio-page-inspector"
                disabled={busy || !!retry}
              >
                <legend>Page settings</legend>
                <div className="studio-actions">
                  <label>
                    Edit page
                    <select
                      aria-label="Edit page"
                      value={selected}
                      onChange={(e) => {
                        setSelected(e.target.value);
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
                </div>
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
                        ].map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Text / transcript
                      <textarea
                        aria-label="Text / transcript"
                        rows={6}
                        maxLength={10000}
                        value={page.transcript}
                        onChange={(e) =>
                          updatePage({ ...page, transcript: e.target.value })
                        }
                      />
                    </label>
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
                      onUploaded={(asset) =>
                        setUploads(
                          (old) =>
                            old && {
                              ...old,
                              items: [
                                asset,
                                ...old.items.filter((a) => a.id !== asset.id),
                              ],
                            },
                        )
                      }
                    />
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
            </div>
            <PageLibrary
              api={api}
              uploads={uploads}
              page={page}
              disabled={
                busy || !!retry || Object.keys(draft.story.pages).length >= 80
              }
              key={draft.story.id}
              onSaved={(record, instanceId) => {
                setDraft((current) => {
                  const instance = current?.story.pages[instanceId];
                  if (
                    !current ||
                    !instance ||
                    current.story.id !== draft.story.id
                  )
                    return current;
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
                setDirty(true);
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
              }}
            />
            {preview && (
              <section className="studio-preview">
                <div className="section-heading">
                  <h2>Private preview</h2>
                  <Button onClick={() => setPreview(null)}>
                    Close preview
                  </Button>
                </div>
                <p>
                  Test only — progress is not saved. Dice can be forced to test
                  routes.
                </p>
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
              </section>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
