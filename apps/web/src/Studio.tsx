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
import { baseStats, start, transition } from "../../../packages/domain/index";
import { sceneMedia, resolveFixtureMedia } from "../../../fixtures/media";
import { Story } from "./Story";
import { Page } from "./Page";
import { ClipPicker } from "./ClipPicker";
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
type Listing = {
  items: {
    id: string;
    title: string;
    revision: number;
    publishedVersionId: string | null;
  }[];
  nextCursor: string | null;
  canPublish: boolean;
  uid: string;
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
  const create = () => {
    const id = `story-${crypto.randomUUID()}`;
    setDraft({
      revision: 0,
      publishedVersionId: null,
      description: "",
      story: {
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
    if (!page) return;
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
    const { video: _, ...rest } = page;
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
  const editChoice = (index: number, c: Choice) =>
    page &&
    updatePage({
      ...page,
      choices: page.choices.map((old, i) => (i === index ? c : old)),
    });
  return (
    <section className="studio">
      <div className="section-heading">
        <div>
          <p className="eyebrow">CREATOR STUDIO · ALPHA</p>
          <h1>Build your next world.</h1>
        </div>
        <button disabled={busy || dirty || !!retry} onClick={create}>
          New story
        </button>
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
            <button onClick={() => setNotice("")} aria-label="Dismiss message">
              ×
            </button>
          </div>
        )}
        {busy && (
          <div className="loading-overlay" role="status">
            <span className="loading-card">Working on your story…</span>
          </div>
        )}
      </div>
      {!listing && !busy && (
        <button onClick={() => void work(() => loadList())}>
          Retry loading drafts
        </button>
      )}
      {listing && !listing.canPublish && (
        <p>
          Publishing is invite-only during alpha. Your publisher ID:{" "}
          <code>{listing.uid}</code>. Drafts and previews are available.
        </p>
      )}
      <div className="studio-layout">
        <aside className="studio-library">
          <h2>Your drafts</h2>
          {listing?.items.map((d) => (
            <button
              key={d.id}
              disabled={busy || dirty || !!retry}
              onClick={() => open(d.id)}
            >
              {d.title}
              <small>{d.publishedVersionId ?? "Private draft"}</small>
            </button>
          ))}
          {listing?.nextCursor && (
            <button
              disabled={busy}
              onClick={() => void work(() => loadList(listing.nextCursor!))}
            >
              More drafts
            </button>
          )}
          {!listing?.items.length && (
            <p>Create your first story to get started.</p>
          )}
        </aside>
        {draft && (
          <div className="studio-editor">
            <div className="studio-actions">
              <button
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
                        },
                      },
                    }),
                  )
                }
              >
                Save draft
              </button>
              <button
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
              </button>
              <button
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
              </button>
              {draft.publishedVersionId && (
                <button
                  disabled={busy || dirty || !!retry}
                  onClick={() => onPlay(draft.story.id)}
                >
                  Play published story
                </button>
              )}
              <span>
                {dirty ? "Unsaved changes" : `Saved revision ${draft.revision}`}
              </span>
              {draft.revision > 0 && (
                <button
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
                </button>
              )}
              {retry && (
                <button
                  disabled={busy || offline}
                  onClick={() => void work(() => send(retry))}
                >
                  Retry same request
                </button>
              )}
            </div>
            <p className="muted">
              Publish makes this story public in Discover. Only publish content
              you have rights to share. Sample clips are placeholders. Uploaded
              clips become public when you publish a story that uses them.
            </p>
            <fieldset disabled={busy || !!retry}>
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
                <button
                  disabled={Object.keys(draft.story.pages).length >= 80}
                  onClick={() => {
                    const id = `page-${crypto.randomUUID().slice(0, 8)}`;
                    change({
                      ...draft.story,
                      pages: { ...draft.story.pages, [id]: makePage(id) },
                    });
                    setSelected(id);
                  }}
                >
                  Add page
                </button>
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
                  {page.pageType !== "dice" && (
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
                      ) : (
                        <p>Stat check configured in advanced outputs.</p>
                      )}
                      {page.pageType.endsWith("options") && (
                        <button
                          onClick={() =>
                            updatePage({
                              ...page,
                              choices: page.choices.filter((_, j) => j !== i),
                            })
                          }
                        >
                          Remove option {i + 1}
                        </button>
                      )}
                    </div>
                  ))}
                  {page.kind !== "ending" &&
                    page.pageType.endsWith("options") && (
                      <button
                        disabled={page.choices.length >= 20}
                        onClick={() =>
                          updatePage({
                            ...page,
                            choices: [...page.choices, choice()],
                          })
                        }
                      >
                        Add option
                      </button>
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
                  <button
                    disabled={page.id === draft.story.entryPageId}
                    onClick={() => {
                      const pages = { ...draft.story.pages };
                      delete pages[page.id];
                      change({ ...draft.story, pages });
                      setSelected(draft.story.entryPageId);
                    }}
                  >
                    Delete page
                  </button>
                </>
              )}
            </fieldset>
            {preview && (
              <section className="studio-preview">
                <div className="section-heading">
                  <h2>Private preview</h2>
                  <button onClick={() => setPreview(null)}>
                    Close preview
                  </button>
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
                    media={mediaFor(
                      preview.story.pages[preview.save.pageId].video,
                    )}
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
                      <button
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
                      </button>
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
