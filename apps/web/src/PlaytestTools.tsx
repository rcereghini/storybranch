import { useEffect, useState } from "react";
import type { Story } from "../../../packages/contracts/index";
import {
  playtestReplaySchema,
  type PreviewScenario,
  type PlaytestStep,
} from "../../../packages/contracts/preview";
import { runPlaytest } from "../../../packages/domain/playtest";

export function PlaytestTools({
  story,
  scenario,
  history,
  onChange,
  onRestart,
}: {
  story: Story;
  scenario: PreviewScenario;
  history: PlaytestStep[];
  onChange: (scenario: PreviewScenario) => void;
  onRestart: () => void;
}) {
  const [message, setMessage] = useState("");
  const [replay, setReplay] = useState(scenario.replay);
  useEffect(() => {
    setReplay(scenario.replay);
    setMessage("");
  }, [JSON.stringify(scenario)]);
  const run = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Unable to update playtest.");
    }
  };
  return (
    <div className="preview-key-tools playtest-tools">
      <details>
        <summary>Recorded playtest and assertions</summary>
        <p>
          Capture this path, edit its expected destinations, then save the
          current setup. Running assertions tests rules without playing media or
          changing this preview.
        </p>
        <p>Recorded commands: {history.length}/100</p>
        <ol aria-label="Preview route history">
          {history.map((step, i) => (
            <li key={i}>
              {step.from} · {step.choiceId} · {step.action}
              {step.roll !== undefined ? ` ${step.roll}` : ""} →{" "}
              {step.expected.storyNodeId} ({step.expected.status})
            </li>
          ))}
        </ol>
        <button
          className="btn btn-secondary"
          disabled={!history.length}
          onClick={() =>
            run(() => {
              const next = playtestReplaySchema.parse({
                version: 1,
                steps: history,
              });
              setReplay(next);
              onChange({ ...scenario, replay: next });
              setMessage(
                "Recorded path captured. Save the current setup to retain it.",
              );
            })
          }
        >
          Capture path as assertions
        </button>
        <button className="btn btn-secondary" onClick={onRestart}>
          Restart preview recording
        </button>
        {replay && (
          <>
            <ol>
              {replay.steps.map((step, i) => (
                <li key={i}>
                  <p>
                    {step.from} · {step.choiceId} · {step.action}
                    {step.roll !== undefined ? ` ${step.roll}` : ""}
                  </p>
                  <label>
                    Expected destination {i + 1}
                    <select
                      aria-label={`Expected destination ${i + 1}`}
                      value={step.expected.storyNodeId}
                      onChange={(e) =>
                        setReplay({
                          ...replay,
                          steps: replay.steps.map((s, j) =>
                            i === j
                              ? {
                                  ...s,
                                  expected: {
                                    ...s.expected,
                                    storyNodeId: e.target.value,
                                  },
                                }
                              : s,
                          ),
                        })
                      }
                    >
                      {!story.storyNodes[step.expected.storyNodeId] && (
                        <option value={step.expected.storyNodeId}>
                          {step.expected.storyNodeId} (unavailable)
                        </option>
                      )}
                      {Object.values(story.storyNodes).map((node) => (
                        <option value={node.id} key={node.id}>
                          {node.title} ({node.id})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Expected status {i + 1}
                    <select
                      aria-label={`Expected status ${i + 1}`}
                      value={step.expected.status}
                      onChange={(e) =>
                        setReplay({
                          ...replay,
                          steps: replay.steps.map((s, j) =>
                            i === j
                              ? {
                                  ...s,
                                  expected: {
                                    ...s.expected,
                                    status: e.target.value as
                                      | "active"
                                      | "completed",
                                  },
                                }
                              : s,
                          ),
                        })
                      }
                    >
                      <option value="active">Active</option>
                      <option value="completed">Completed</option>
                    </select>
                  </label>
                </li>
              ))}
            </ol>
            <button
              className="btn btn-primary"
              onClick={() =>
                run(() => {
                  onChange({
                    ...scenario,
                    replay: playtestReplaySchema.parse(replay),
                  });
                  setMessage(
                    "Assertions applied. Save the current setup to retain them.",
                  );
                })
              }
            >
              Apply assertions
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setReplay(scenario.replay);
                setMessage("Assertion edits reset.");
              }}
            >
              Reset assertion edits
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => {
                const next = { ...scenario };
                delete next.replay;
                onChange(next);
                setReplay(undefined);
                setMessage("Assertions cleared from the current setup.");
              }}
            >
              Clear assertions
            </button>
          </>
        )}
        <button
          className="btn btn-primary"
          disabled={!scenario.replay}
          onClick={() => {
            const report = runPlaytest(story, scenario);
            setMessage(`${report.passed ? "PASS" : "FAIL"}: ${report.message}`);
          }}
        >
          Run applied assertions
        </button>
        <p className="key-history-status" role="status">
          {message}
        </p>
      </details>
    </div>
  );
}
