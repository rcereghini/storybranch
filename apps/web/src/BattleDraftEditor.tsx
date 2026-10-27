import { useEffect, useRef, useState } from "react";
import { createApi } from "../../../packages/api-client/index";
import { auth } from "./firebase";
import {
  draftSchema,
  type DraftRecord,
} from "../../../packages/contracts/authoring";
import { storyNodeSchema } from "../../../packages/contracts/index";
import {
  stagedBattleNodeSchema,
  type StagedBattleStory,
  type StagedBattleNode,
} from "../../../packages/contracts/battle-graph";
import {
  battlePlaytestReplaySchema,
  type BattlePlaytestIntent,
  type BattlePlaytestStep,
} from "../../../packages/contracts/battle-playtest";
import { reviewBattleGraph } from "../../../packages/domain/battle-graph";
import { connectStoryNode } from "../../../packages/domain/story-graph";
import {
  startBattlePreview,
  recordBattlePreviewStep,
  runBattlePlaytest,
} from "../../../packages/domain/battle-playtest";
import { renderBattleNode } from "../../../packages/domain/battle-view";
import { renderStoryNode } from "../../../packages/domain/player";
import { baseStats } from "../../../packages/domain/index";
import { resolveFixtureMedia } from "../../../fixtures/media";
import {
  assetIdOf,
  type UploadListing,
} from "../../../packages/contracts/media";
import { StoryGraph } from "./StoryGraph";
import { StoryOutline } from "./StoryOutline";
import { BattleOutputBindingsEditor } from "./BattleOutputBindingsEditor";
import { StoryInputsEditor } from "./StoryInputsEditor";
import { Story } from "./Story";
import { StoryNode } from "./StoryNode";
import { panelImages } from "./ComicEditor";
import "./battle-authoring.css";

const api = createApi(
  fetch,
  async () => auth.currentUser?.getIdToken() ?? null,
);
const scenario = {
  version: 1,
  storyKeys: [],
  importedKeys: [],
  accountKeys: [],
};
const outcomes = ["win", "loss", "escape"] as const;
type Node = StagedBattleStory["storyNodes"][string];
const parseNode = (input: unknown): Node =>
  stagedBattleNodeSchema.or(storyNodeSchema).parse(input);
const draftBody = ({ revision, publishedVersionId, ...body }: DraftRecord) =>
  draftSchema.parse(body);

export function BattleDraftEditor({
  initial,
  onExit,
  onDirtyChange,
}: {
  initial: DraftRecord;
  onExit: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [selected, setSelected] = useState(initial.story.entryStoryNodeId);
  const [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState(false);
  const [pending, setPending] = useState(false);
  const [uploads, setUploads] = useState<UploadListing>();
  const [replay, setReplay] = useState("");
  const [request, setRequest] = useState<{
    idempotencyKey: string;
    expectedRevision: number;
    draft: ReturnType<typeof draftBody>;
  }>();
  const history = useRef<DraftRecord[]>([]);
  const locked = busy || !!request;
  useEffect(() => {
    onDirtyChange(dirty || pending);
    return () => onDirtyChange(false);
  }, [dirty, pending, onDirtyChange]);
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => {
      if (dirty || pending) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    addEventListener("beforeunload", leave);
    return () => removeEventListener("beforeunload", leave);
  }, [dirty, pending]);
  useEffect(() => {
    api<UploadListing>("/uploads").then(setUploads, () => {});
  }, []);
  const attempt = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      setNotice(
        e instanceof Error && e.name !== "ZodError"
          ? e.message
          : "Invalid node configuration. Check types, bounds and required fields.",
      );
    }
  };
  const edit = (next: DraftRecord) => {
    if (locked) return;
    history.current = [...history.current, draft].slice(-60);
    setDraft(next);
    setDirty(true);
    setNotice("");
  };
  const save = async () => {
    if (busy) return;
    let command = request;
    try {
      command ??= {
        idempotencyKey: crypto.randomUUID(),
        expectedRevision: draft.revision,
        draft: draftBody(draft),
      };
      setRequest(command);
      setBusy(true);
      const saved = await api<DraftRecord>(
        `/studio/${draft.story.id}`,
        command,
      );
      setDraft(saved);
      setRequest(undefined);
      setDirty(false);
      setNotice("Draft saved. Battle publication remains gated.");
    } catch (e) {
      setNotice(
        `${(e as Error).message} Retry the same save, or reload to recover the server draft.`,
      );
    } finally {
      setBusy(false);
    }
  };
  const add = (
    type:
      | "battle"
      | "text"
      | "text-options"
      | "video"
      | "video-options"
      | "ending",
  ) => {
    if (Object.keys(draft.story.storyNodes).length >= 80) return;
    const id = `node-${crypto.randomUUID()}`;
    const target =
      Object.values(draft.story.storyNodes).find(
        (node) => node.kind === "ending",
      )?.id ?? "unfinished";
    const common = {
      id,
      title: type === "battle" ? "New battle" : "New StoryNode",
      transcript: "",
      entryEffects: [],
    };
    const node: Node =
      type === "battle"
        ? {
            ...common,
            kind: "scene",
            storyNodeType: "battle",
            battle: {
              version: 1,
              rules: "battle-1",
              enemy: {
                name: "Guardian",
                maxHealth: 20,
                attack: 4,
                defense: 1,
                agility: 5,
              },
              maxTurns: 10,
            },
            outputs: {
              win: { targetStoryNodeId: target, effects: [] },
              loss: { targetStoryNodeId: target, effects: [] },
              escape: { targetStoryNodeId: target, effects: [] },
            },
          }
        : {
            ...common,
            kind: type === "ending" ? "ending" : "scene",
            storyNodeType: type === "ending" ? "text" : type,
            choices:
              type === "ending"
                ? []
                : [
                    {
                      id: "next",
                      label: "Next",
                      costs: [],
                      unavailableDisplay: "hidden",
                      outcome: {
                        kind: "direct",
                        route: { targetStoryNodeId: target, effects: [] },
                      },
                    },
                  ],
          };
    edit({
      ...draft,
      story: {
        ...draft.story,
        entryStoryNodeId: Object.keys(draft.story.storyNodes).length
          ? draft.story.entryStoryNodeId
          : id,
        storyNodes: { ...draft.story.storyNodes, [id]: node },
      },
    });
    setSelected(id);
  };
  const review = reviewBattleGraph(draft.story);
  const node = draft.story.storyNodes[selected];
  return (
    <section className="studio battle-authoring">
      <header className="studio-preview-head">
        <div>
          <h1>Battle authoring</h1>
          <p>
            {draft.story.title} · {dirty ? "Unsaved changes" : "Saved draft"} ·
            Publication gated
          </p>
        </div>
        <button
          className="btn btn-secondary"
          disabled={busy}
          onClick={() => {
            if (
              (!dirty && !pending) ||
              confirm("Discard unsaved changes and leave this editor?")
            )
              onExit();
          }}
        >
          Back to drafts
        </button>
        <button
          className="btn btn-primary"
          disabled={busy || pending}
          onClick={() => void save()}
        >
          {busy ? "Saving…" : request ? "Retry save" : "Save battle draft"}
        </button>
        <button
          className="btn btn-secondary"
          disabled={busy}
          onClick={() => {
            if (
              (dirty || pending) &&
              !confirm("Reload the saved draft and discard local edits?")
            )
              return;
            setBusy(true);
            api<DraftRecord>(`/studio/${draft.story.id}`)
              .then(
                (value) => {
                  setDraft(value);
                  setRequest(undefined);
                  setDirty(false);
                  history.current = [];
                  setNotice("Saved draft reloaded.");
                },
                (error) => setNotice(error.message),
              )
              .finally(() => setBusy(false));
          }}
        >
          Reload saved draft
        </button>
        <button
          className="btn btn-secondary"
          disabled={locked || pending || !history.current.length}
          onClick={() => {
            const previous = history.current.pop();
            if (previous) {
              setDraft({
                ...previous,
                revision: draft.revision,
                publishedVersionId: draft.publishedVersionId,
              });
              setDirty(true);
              setNotice("Graph edit undone. Save to persist changes.");
            }
          }}
        >
          Undo graph edit
        </button>
        <button
          className="btn btn-secondary"
          disabled={!review.story || busy || pending}
          onClick={() => setPreview(true)}
        >
          Preview graph
        </button>
      </header>
      <p className="battle-authoring-status" role="status">
        {pending
          ? "Apply or reset selected node edits before saving or previewing."
          : notice ||
            "Save explicitly. Battle nodes are part of this draft; publishing them is not enabled."}
      </p>
      <div className="battle-authoring-layout">
        <aside>
          <label>
            First StoryNode
            <select
              aria-label="First StoryNode"
              disabled={locked || pending}
              value={draft.story.entryStoryNodeId}
              onChange={(event) =>
                edit({
                  ...draft,
                  story: {
                    ...draft.story,
                    entryStoryNodeId: event.target.value,
                  },
                })
              }
            >
              <option value="unfinished">Select start</option>
              {Object.values(draft.story.storyNodes).map((node) => (
                <option key={node.id} value={node.id}>
                  {node.title}
                </option>
              ))}
            </select>
          </label>
          <StoryOutline
            story={draft.story}
            selected={selected}
            onSelect={(id) => {
              if (!pending || confirm("Discard unapplied node edits?"))
                setSelected(id);
            }}
          />
        </aside>
        <div className="battle-authoring-map">
          <StoryGraph
            story={draft.story}
            positions={draft.storyNodePositions}
            selected={selected}
            disabled={locked || pending}
            focus={0}
            onSelect={setSelected}
            onMove={(positions) =>
              edit({ ...draft, storyNodePositions: positions })
            }
            onConnect={(source, edge, target) =>
              attempt(() =>
                edit({
                  ...draft,
                  story: connectStoryNode(draft.story, source, edge, target),
                }),
              )
            }
            onAdd={add}
            onAddBattle={() => add("battle")}
          />
        </div>
        <aside>
          {node && (
            <NodeEditor
              key={JSON.stringify(node)}
              node={node}
              story={draft.story}
              disabled={locked}
              onPending={setPending}
              onApply={(next) =>
                edit({
                  ...draft,
                  story: {
                    ...draft.story,
                    storyNodes: { ...draft.story.storyNodes, [next.id]: next },
                  },
                })
              }
            />
          )}
          {node && (
            <button
              className="btn btn-secondary"
              disabled={locked || pending}
              onClick={() => {
                const nodes = { ...draft.story.storyNodes };
                delete nodes[node.id];
                edit({
                  ...draft,
                  story: { ...draft.story, storyNodes: nodes },
                });
                setSelected(Object.keys(nodes)[0] ?? "");
              }}
            >
              Remove selected StoryNode
            </button>
          )}
          <h2>Graph validation</h2>
          <p>{review.error ?? "A safe preview is available."}</p>
          <ul aria-label="Graph diagnostics">
            {review.diagnostics.map((item, i) => (
              <li key={i}>
                {item.storyNodeId}: {item.message}
              </li>
            ))}
          </ul>
        </aside>
      </div>
      {preview && (
        <GraphPreview
          story={draft.story}
          uploads={uploads}
          replay={replay}
          onReplay={setReplay}
          onClose={() => setPreview(false)}
        />
      )}
    </section>
  );
}

function NodeEditor({
  node,
  story,
  disabled,
  onApply,
  onPending,
}: {
  node: Node;
  story: StagedBattleStory;
  disabled: boolean;
  onApply: (node: Node) => void;
  onPending: (pending: boolean) => void;
}) {
  const [value, setValue] = useState(node),
    [json, setJson] = useState(JSON.stringify(node, null, 2)),
    [status, setStatus] = useState("");
  const pending =
    JSON.stringify(value) !== JSON.stringify(node) ||
    json !== JSON.stringify(node, null, 2);
  useEffect(() => {
    onPending(pending);
    return () => onPending(false);
  }, [pending, onPending]);
  const apply = (next: unknown) => {
    try {
      const parsed = parseNode(next);
      if (parsed.id !== node.id)
        throw Error("Placement identity cannot change.");
      setValue(parsed);
      setJson(JSON.stringify(parsed, null, 2));
      setStatus("");
      onApply(parsed);
    } catch (e) {
      setStatus(
        e instanceof Error && e.name !== "ZodError"
          ? e.message
          : "Invalid node shape or bounds. Your changes were not applied.",
      );
    }
  };
  const battle = value.storyNodeType === "battle" ? value : null;
  const pendingReview = battle
    ? reviewBattleGraph({
        ...story,
        storyNodes: { ...story.storyNodes, [value.id]: value },
      })
    : null;
  const updateBattle = (change: Partial<StagedBattleNode["battle"]>) => {
    if (battle)
      setValue({ ...battle, battle: { ...battle.battle, ...change } });
  };
  return (
    <fieldset disabled={disabled}>
      <legend>Selected StoryNode</legend>
      <label>
        Node title
        <input
          value={value.title}
          onChange={(event) =>
            setValue({ ...value, title: event.target.value })
          }
        />
      </label>
      <label>
        Narrative
        <textarea
          value={value.transcript}
          onChange={(event) =>
            setValue({ ...value, transcript: event.target.value })
          }
        />
      </label>
      <StoryInputsEditor
        node={value}
        onApply={(inputs) => setValue({ ...value, inputs })}
      />
      {battle && (
        <>
          <label>
            Enemy name
            <input
              value={battle.battle.enemy.name}
              maxLength={80}
              onChange={(event) =>
                updateBattle({
                  enemy: { ...battle.battle.enemy, name: event.target.value },
                })
              }
            />
          </label>
          {(
            [
              ["maxHealth", "Enemy health", 1, 100],
              ["attack", "Enemy attack", 1, 20],
              ["defense", "Enemy defense", 0, 10],
              ["agility", "Enemy agility", 1, 20],
            ] as const
          ).map(([key, label, min, max]) => (
            <label key={key}>
              {label}
              <input
                type="number"
                min={min}
                max={max}
                value={
                  Number.isNaN(battle.battle.enemy[key])
                    ? ""
                    : battle.battle.enemy[key]
                }
                onChange={(event) =>
                  updateBattle({
                    enemy: {
                      ...battle.battle.enemy,
                      [key]: event.target.valueAsNumber,
                    },
                  })
                }
              />
            </label>
          ))}
          <label>
            Turn limit
            <input
              type="number"
              min={1}
              max={30}
              value={
                Number.isNaN(battle.battle.maxTurns)
                  ? ""
                  : battle.battle.maxTurns
              }
              onChange={(event) =>
                updateBattle({ maxTurns: event.target.valueAsNumber })
              }
            />
          </label>
          {(["preemptive", "attackBonus", "defenseBonus"] as const).map(
            (key) => (
              <label key={key}>
                {key} input
                <select
                  aria-label={`${key} input`}
                  value={battle.battle.inputs?.[key] ?? ""}
                  onChange={(event) => {
                    const inputs = { ...battle.battle.inputs };
                    if (event.target.value) inputs[key] = event.target.value;
                    else delete inputs[key];
                    updateBattle({ inputs });
                  }}
                >
                  <option value="">Use default</option>
                  {value.inputs?.fields
                    .filter(
                      (field) =>
                        field.type ===
                        (key === "preemptive" ? "boolean" : "integer"),
                    )
                    .map((field) => (
                      <option key={field.name} value={field.name}>
                        {field.name}
                      </option>
                    ))}
                </select>
              </label>
            ),
          )}
          {outcomes.map((outcome) => (
            <div key={outcome}>
              <label>
                {outcome} destination
                <select
                  aria-label={`${outcome} destination`}
                  value={battle.outputs[outcome].targetStoryNodeId}
                  onChange={(event) =>
                    setValue({
                      ...battle,
                      outputs: {
                        ...battle.outputs,
                        [outcome]: {
                          ...battle.outputs[outcome],
                          targetStoryNodeId: event.target.value,
                        },
                      },
                    })
                  }
                >
                  <option value="unfinished">Unfinished</option>
                  {battle.outputs[outcome].targetStoryNodeId !== "unfinished" &&
                    !story.storyNodes[
                      battle.outputs[outcome].targetStoryNodeId
                    ] && (
                      <option value={battle.outputs[outcome].targetStoryNodeId}>
                        Missing: {battle.outputs[outcome].targetStoryNodeId}
                      </option>
                    )}
                  {Object.values(story.storyNodes).map((target) => (
                    <option key={target.id} value={target.id}>
                      {target.title}
                    </option>
                  ))}
                </select>
              </label>
              <BattleOutputBindingsEditor
                outcome={outcome}
                inputs={
                  story.storyNodes[battle.outputs[outcome].targetStoryNodeId]
                    ?.inputs
                }
                value={battle.outputs[outcome].inputBindings}
                onChange={(inputBindings) =>
                  setValue({
                    ...battle,
                    outputs: {
                      ...battle.outputs,
                      [outcome]: {
                        ...battle.outputs[outcome],
                        inputBindings,
                      },
                    },
                  })
                }
              />
            </div>
          ))}
          <div
            className="battle-binding-diagnostics"
            aria-label="Pending battle diagnostics"
            role="status"
          >
            {pendingReview?.error}
            {pendingReview?.diagnostics
              .filter((item) => item.storyNodeId === value.id)
              .map((item, index) => (
                <p key={index}>{item.message}</p>
              ))}
          </div>
        </>
      )}
      <button className="btn btn-primary" onClick={() => apply(value)}>
        Apply node changes
      </button>
      <button
        className="btn btn-secondary"
        onClick={() => {
          setValue(node);
          setJson(JSON.stringify(node, null, 2));
          setStatus("");
        }}
      >
        Reset node changes
      </button>
      <p role="status" className="battle-authoring-status">
        {status}
      </p>
      <details>
        <summary>Advanced node JSON</summary>
        <p>
          Includes ordinary choices, media, entry effects and typed output
          bindings. Applying JSON replaces this node’s fields.
        </p>
        <textarea
          aria-label="Node JSON"
          maxLength={100000}
          rows={14}
          value={json}
          onChange={(event) => setJson(event.target.value)}
        />
        <button
          className="btn btn-secondary"
          onClick={() => {
            try {
              apply(JSON.parse(json));
            } catch {
              setStatus("Invalid JSON. Changes were not applied.");
            }
          }}
        >
          Apply node JSON
        </button>
      </details>
    </fieldset>
  );
}

function GraphPreview({
  story,
  uploads,
  replay,
  onReplay,
  onClose,
}: {
  story: StagedBattleStory;
  uploads?: UploadListing;
  replay: string;
  onReplay: (value: string) => void;
  onClose: () => void;
}) {
  const [source] = useState(story);
  const [session, setSession] = useState(() => ({
    ...startBattlePreview(source, scenario),
    history: [] as BattlePlaytestStep[],
    serial: 0,
  }));
  const [status, setStatus] = useState("");
  const dialog = useRef<HTMLDialogElement>(null),
    launcher = useRef(document.activeElement as HTMLElement | null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  const close = () => {
    dialog.current?.close();
    launcher.current?.focus();
    onClose();
  };
  const current = session.story.storyNodes[session.save.storyNodeId];
  const dispatch = (intent: BattlePlaytestIntent) => {
    try {
      setSession({
        ...session,
        ...recordBattlePreviewStep(
          session.story,
          session.save,
          scenario,
          session.history,
          intent,
          Date.now(),
        ),
      });
    } catch (e) {
      setStatus((e as Error).message);
    }
  };
  const restart = () =>
    setSession({
      ...startBattlePreview(source, scenario),
      history: [],
      serial: session.serial + 1,
    });
  const media =
    current.storyNodeType === "battle"
      ? undefined
      : (uploads?.items.find((item) => item.id === assetIdOf(current.video))
          ?.media ?? resolveFixtureMedia(current.video ?? ""));
  return (
    <dialog
      ref={dialog}
      className="battle-workshop"
      aria-label="Battle graph preview"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const elements = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), textarea, summary, [tabindex="0"]',
          ),
        ).filter((element) => element.getClientRects().length);
        if (event.shiftKey && document.activeElement === elements[0]) {
          event.preventDefault();
          elements.at(-1)?.focus();
        } else if (
          !event.shiftKey &&
          document.activeElement === elements.at(-1)
        ) {
          event.preventDefault();
          elements[0]?.focus();
        }
      }}
    >
      <header className="studio-preview-head">
        <h2>Battle graph preview</h2>
        <button className="btn btn-secondary" onClick={close}>
          Close graph preview
        </button>
      </header>
      <div className="battle-workshop-body">
        <p>
          Private preview of the actual graph. Default starting stats and
          highest Dice rolls. No real progress is saved.
        </p>
        <details>
          <summary>Graph assertions</summary>
          <p>
            {session.history.length}/100 commands recorded. Assertions are
            retained during this editor session only; copy the JSON to keep
            them.
          </p>
          <button
            className="btn btn-secondary"
            disabled={!session.history.length}
            onClick={() =>
              onReplay(
                JSON.stringify({ version: 1, steps: session.history }, null, 2),
              )
            }
          >
            Capture graph assertions
          </button>
          <textarea
            aria-label="Graph assertions JSON"
            maxLength={100000}
            rows={8}
            value={replay}
            onChange={(event) => onReplay(event.target.value)}
          />
          <button
            className="btn btn-secondary"
            onClick={() => {
              try {
                const report = runBattlePlaytest(
                  source,
                  scenario,
                  battlePlaytestReplaySchema.parse(JSON.parse(replay)),
                );
                setStatus(
                  `${report.passed ? "PASS" : "FAIL"}: ${report.message}`,
                );
              } catch {
                setStatus("Invalid assertion JSON.");
              }
            }}
          >
            Run graph assertions
          </button>
        </details>
        <p className="battle-workshop-status" role="status">
          {status}
        </p>
        <button className="btn btn-secondary" onClick={restart}>
          Restart graph preview
        </button>
        <Story
          key={session.serial}
          story={session.story}
          save={session.save}
          user={{
            id: "preview",
            stats: baseStats,
            achievements: [],
            saveSpots: [],
          }}
        >
          <StoryNode
            storyNode={
              current.storyNodeType === "battle"
                ? renderBattleNode(current, session.save)
                : renderStoryNode(
                    current,
                    session.save,
                    [],
                    session.story.itemCatalogue,
                  )
            }
            media={media}
            image={
              current.storyNodeType === "battle"
                ? undefined
                : uploads?.items.find(
                    (item) => item.id === assetIdOf(current.image),
                  )?.url
            }
            panels={
              current.storyNodeType !== "battle" && current.comic
                ? panelImages(current.comic, uploads ?? null)
                : undefined
            }
            disabled={session.history.length >= 100}
            transitioning={false}
            onPlaybackChange={() => {}}
            onBattleAction={(action) => dispatch({ kind: "battle", action })}
            onOutput={(output) =>
              dispatch({
                kind: "choice",
                choiceId: output.choiceId,
                action: output.action ?? "continue",
              })
            }
          >
            {session.save.status === "completed" && (
              <button className="btn btn-primary" onClick={restart}>
                Replay graph
              </button>
            )}
          </StoryNode>
        </Story>
      </div>
    </dialog>
  );
}
