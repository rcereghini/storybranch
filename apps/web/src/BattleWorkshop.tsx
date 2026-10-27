import { useEffect, useRef, useState } from "react";
import type {
  Story as StoryData,
  StoryNode as NodeData,
} from "../../../packages/contracts/index";
import type { SceneMedia } from "../../../packages/contracts/media";
import type {
  BattlePlaytestIntent,
  BattlePlaytestStep,
} from "../../../packages/contracts/battle-playtest";
import { battlePlaytestScenarioSchema } from "../../../packages/contracts/battle-playtest";
import { stagedBattleNodeSchema } from "../../../packages/contracts/battle-graph";
import {
  startBattlePreview,
  recordBattlePreviewStep,
  runBattlePlaytest,
} from "../../../packages/domain/battle-playtest";
import { renderBattleNode } from "../../../packages/domain/battle-view";
import { renderStoryNode } from "../../../packages/domain/player";
import { baseStats } from "../../../packages/domain/index";
import { Story } from "./Story";
import { StoryNode } from "./StoryNode";

const scenario = battlePlaytestScenarioSchema.parse({
  version: 1,
  storyKeys: [],
  importedKeys: [],
  accountKeys: [],
});
const initialEnemy = {
  name: "Guardian",
  maxHealth: 20,
  attack: 4,
  defense: 1,
  agility: 5,
};
const outcomes = ["win", "loss", "escape"] as const;
type Setup = {
  nodeId: string;
  enemy: typeof initialEnemy;
  maxTurns: number;
  targets: Record<(typeof outcomes)[number], string>;
};
type Session = ReturnType<typeof startBattlePreview> & {
  history: BattlePlaytestStep[];
  serial: number;
};

/** A disposable graph copy, never draft metadata or a player command source. */
export function BattleWorkshop({
  story,
  mediaFor,
  imageFor,
  panelsFor,
}: {
  story: StoryData;
  mediaFor: (video: string | undefined) => SceneMedia | undefined;
  imageFor: (image: string | undefined) => string | undefined;
  panelsFor: (node: NodeData) => Array<string | undefined> | undefined;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={trigger}
        className="btn btn-secondary btn-small"
        onClick={() => setOpen(true)}
      >
        Battle workshop
      </button>
      {open && (
        <Workshop
          story={story}
          mediaFor={mediaFor}
          imageFor={imageFor}
          panelsFor={panelsFor}
          onClose={() => {
            setOpen(false);
            trigger.current?.focus();
          }}
        />
      )}
    </>
  );
}

function Workshop({
  story,
  mediaFor,
  imageFor,
  panelsFor,
  onClose,
}: Parameters<typeof BattleWorkshop>[0] & { onClose: () => void }) {
  // Snapshot once: unrelated autosave completions cannot replace a running simulation.
  const [source] = useState(() => structuredClone(story));
  const scenes = Object.values(source.storyNodes).filter(
    (node) => node.kind === "scene",
  );
  const leaf =
    Object.values(source.storyNodes).find((node) => node.kind !== "scene")
      ?.id ?? "";
  const [setup, setSetup] = useState<Setup>(() => ({
    nodeId: scenes[0]?.id ?? "",
    enemy: { ...initialEnemy },
    maxTurns: 10,
    targets: { win: leaf, loss: leaf, escape: leaf },
  }));
  const [applied, setApplied] = useState(setup);
  const [session, setSession] = useState<Session>();
  const [message, setMessage] = useState("");
  const [replay, setReplay] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => {
      element?.close();
    };
  }, []);
  const close = () => {
    dialog.current?.close();
    onClose();
  };
  const attempt = (action: () => void) => {
    try {
      action();
    } catch (error) {
      setMessage(
        error instanceof Error && error.name !== "ZodError"
          ? error.message
          : "Invalid configuration or bounds. Check the encounter and destinations.",
      );
    }
  };
  const apply = () =>
    attempt(() => {
      const original = source.storyNodes[setup.nodeId];
      if (!original || original.kind !== "scene")
        throw Error("Select a scene to rehearse as a battle.");
      const node = stagedBattleNodeSchema.parse({
        id: original.id,
        title: original.title,
        transcript: original.transcript,
        inputs: original.inputs,
        entryEffects: original.entryEffects,
        kind: "scene",
        storyNodeType: "battle",
        battle: {
          version: 1,
          rules: "battle-1",
          enemy: setup.enemy,
          maxTurns: setup.maxTurns,
        },
        outputs: Object.fromEntries(
          outcomes.map((outcome) => [
            outcome,
            { targetStoryNodeId: setup.targets[outcome], effects: [] },
          ]),
        ),
      });
      const next = startBattlePreview(
        { ...source, storyNodes: { ...source.storyNodes, [node.id]: node } },
        scenario,
      );
      if (!next.story.storyNodes[node.id])
        throw Error(
          "This encounter has no safe reachable path. Check all three destinations and the Story entry.",
        );
      setApplied(structuredClone(setup));
      setSession({ ...next, history: [], serial: (session?.serial ?? 0) + 1 });
      setMessage(
        "Applied. Preview restarted from the Story entry. Draft unchanged.",
      );
    });
  const restart = () =>
    attempt(() => {
      if (!session) return;
      setSession({
        ...startBattlePreview(session.story, scenario),
        history: [],
        serial: session.serial + 1,
      });
      setMessage("Preview restarted. Captured assertions retained.");
    });
  const dispatch = (intent: BattlePlaytestIntent) =>
    attempt(() => {
      if (!session) return;
      const moved = recordBattlePreviewStep(
        session.story,
        session.save,
        scenario,
        session.history,
        intent,
        Date.now(),
      );
      setSession({ ...session, ...moved });
    });
  const current = session?.story.storyNodes[session.save.storyNodeId];
  const dirty = JSON.stringify(setup) !== JSON.stringify(applied);
  return (
    <dialog
      ref={dialog}
      className="battle-workshop"
      aria-labelledby="battle-workshop-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, a[href], [tabindex="0"]',
          ),
        ).filter((element) => element.getClientRects().length > 0);
        const first = controls[0],
          last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
    >
      <header className="studio-preview-head">
        <div>
          <h2 id="battle-workshop-title">Battle workshop</h2>
          <p>
            Private rehearsal. Closing discards this session; your draft is
            unchanged.
          </p>
        </div>
        <button className="btn btn-secondary" autoFocus onClick={close}>
          Close workshop
        </button>
      </header>
      <div className="battle-workshop-body">
        <details open className="battle-workshop-setup">
          <summary>Encounter configuration</summary>
          <p>
            Replace one scene in a temporary copy. All three outcomes need a
            safe route to a StoryLeaf. Preview uses default starting stats and
            highest Dice rolls.
          </p>
          <div className="battle-workshop-fields">
            <label>
              Scene to rehearse
              <select
                value={setup.nodeId}
                onChange={(e) => setSetup({ ...setup, nodeId: e.target.value })}
              >
                <option value="">Select a scene</option>
                {scenes.map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.title} ({node.id})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Enemy name
              <input
                maxLength={80}
                value={setup.enemy.name}
                onChange={(e) =>
                  setSetup({
                    ...setup,
                    enemy: { ...setup.enemy, name: e.target.value },
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
            ).map(([field, label, min, max]) => (
              <label key={field}>
                {label}
                <input
                  type="number"
                  min={min}
                  max={max}
                  step={1}
                  value={
                    Number.isNaN(setup.enemy[field]) ? "" : setup.enemy[field]
                  }
                  onChange={(e) =>
                    setSetup({
                      ...setup,
                      enemy: {
                        ...setup.enemy,
                        [field]: e.target.valueAsNumber,
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
                step={1}
                value={Number.isNaN(setup.maxTurns) ? "" : setup.maxTurns}
                onChange={(e) =>
                  setSetup({ ...setup, maxTurns: e.target.valueAsNumber })
                }
              />
            </label>
            {outcomes.map((outcome) => (
              <label key={outcome}>
                {outcome[0].toUpperCase() + outcome.slice(1)} destination
                <select
                  value={setup.targets[outcome]}
                  onChange={(e) =>
                    setSetup({
                      ...setup,
                      targets: { ...setup.targets, [outcome]: e.target.value },
                    })
                  }
                >
                  <option value="">Select a destination</option>
                  {Object.values(source.storyNodes)
                    .filter((node) => node.id !== setup.nodeId)
                    .map((node) => (
                      <option key={node.id} value={node.id}>
                        {node.title} ({node.id})
                      </option>
                    ))}
                </select>
              </label>
            ))}
          </div>
          <div className="battle-workshop-actions">
            <button className="btn btn-primary" onClick={apply}>
              Apply and restart
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setSetup(structuredClone(applied));
                setMessage("Controls reset to the last applied setup.");
              }}
            >
              Reset configuration
            </button>
          </div>
        </details>
        <p className="battle-workshop-status" role="status">
          {message || "Configure an encounter, then Apply to begin."}
          {dirty && session ? " Unapplied configuration changes." : ""}
        </p>
        {session && current && (
          <>
            <details className="battle-workshop-recording">
              <summary>Recorded battle playtest</summary>
              <p>
                Recorded commands: {session.history.length}/100. Assertions run
                against the applied configuration, without changing this
                preview.
              </p>
              <ol aria-label="Battle preview history">
                {session.history.map((step, index) => (
                  <li key={index}>
                    {step.from} · {step.intent.action} →{" "}
                    {step.expected.storyNodeId} (
                    {step.expected.battle?.phase ?? step.expected.status})
                  </li>
                ))}
              </ol>
              <div className="battle-workshop-actions">
                <button
                  className="btn btn-secondary"
                  disabled={!session.history.length}
                  onClick={() => {
                    setReplay(
                      JSON.stringify(
                        { version: 1, steps: session.history },
                        null,
                        2,
                      ),
                    );
                    setMessage(
                      "Path captured as editable assertions. Closing discards it.",
                    );
                  }}
                >
                  Capture battle assertions
                </button>
                <button className="btn btn-secondary" onClick={restart}>
                  Restart recording
                </button>
              </div>
              <label>
                Battle assertions JSON
                <textarea
                  rows={8}
                  maxLength={100000}
                  value={replay}
                  onChange={(e) => setReplay(e.target.value)}
                />
              </label>
              <button
                className="btn btn-secondary"
                disabled={!replay.trim()}
                onClick={() =>
                  attempt(() => {
                    const report = runBattlePlaytest(
                      session.story,
                      scenario,
                      JSON.parse(replay),
                    );
                    setMessage(
                      `${report.passed ? "PASS" : "FAIL"}: ${report.message}`,
                    );
                  })
                }
              >
                Run battle assertions
              </button>
            </details>
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
                        scenario.accountKeys,
                        session.story.itemCatalogue,
                      )
                }
                media={
                  current.storyNodeType === "battle"
                    ? undefined
                    : mediaFor(current.video)
                }
                image={
                  current.storyNodeType === "battle"
                    ? undefined
                    : imageFor(current.image)
                }
                panels={
                  current.storyNodeType === "battle"
                    ? undefined
                    : panelsFor(current)
                }
                disabled={session.history.length >= 100}
                transitioning={false}
                onPlaybackChange={() => {}}
                onOutput={(output) =>
                  dispatch({
                    kind: "choice",
                    choiceId: output.choiceId,
                    action: output.action ?? "continue",
                  })
                }
                onBattleAction={(action) =>
                  dispatch({ kind: "battle", action })
                }
              >
                {session.save.status === "completed" && (
                  <button className="btn btn-primary" onClick={restart}>
                    Play rehearsal again
                  </button>
                )}
              </StoryNode>
            </Story>
          </>
        )}
      </div>
    </dialog>
  );
}
