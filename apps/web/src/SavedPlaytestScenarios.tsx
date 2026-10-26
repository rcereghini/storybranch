import { useState } from "react";
import type { Story } from "../../../packages/contracts/index";
import {
  savedPlaytestScenariosSchema,
  type SavedPlaytestScenario,
  type PreviewScenario,
} from "../../../packages/contracts/preview";
import { previewScenarioIssues } from "../../../packages/domain/preview";

export function SavedPlaytestScenarios({
  story,
  current,
  entries,
  onChange,
  onLoad,
}: {
  story: Story;
  current: PreviewScenario;
  entries: SavedPlaytestScenario[];
  onChange: (entries: SavedPlaytestScenario[]) => void;
  onLoad: (scenario: PreviewScenario) => void;
}) {
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState("");
  const entry = entries.find((e) => e.id === selected);
  const issues = entry ? previewScenarioIssues(story, entry.scenario) : [];
  const run = (action: () => void) => {
    try {
      action();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Unable to update setup.");
    }
  };
  const update = (next: SavedPlaytestScenario[]) => {
    const parsed = savedPlaytestScenariosSchema.safeParse(next);
    if (!parsed.success)
      throw new Error(
        "Use unique names of 1–60 characters and at most 20 setups.",
      );
    onChange(parsed.data);
    setStatus("Setup updated. Studio autosaves these draft changes.");
  };
  return (
    <div className="preview-key-tools">
      <details>
        <summary>Saved playtest setups ({entries.length}/20)</summary>
        <p>
          Save the applied starting stats, items and key selections. This does
          not save the current position or items earned during preview. Apply
          pending test edits first.
        </p>
        <label>
          Saved setup
          <select
            aria-label="Saved playtest setup"
            value={entry?.id ?? ""}
            onChange={(e) => {
              setSelected(e.target.value);
              setName(
                entries.find((item) => item.id === e.target.value)?.name ?? "",
              );
              setStatus("");
            }}
          >
            <option value="">New setup</option>
            {entries.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {previewScenarioIssues(story, item.scenario).length
                  ? " — needs attention"
                  : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          Setup name
          <input
            aria-label="Playtest setup name"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <div className="preview-key-presets">
          <button
            className="btn btn-secondary"
            disabled={entries.length >= 20}
            onClick={() =>
              run(() => {
                const id = crypto.randomUUID();
                update([...entries, { id, name, scenario: current }]);
                setSelected(id);
              })
            }
          >
            Save current setup as new
          </button>
          <button
            className="btn btn-secondary"
            disabled={!entry || issues.length > 0}
            onClick={() =>
              run(() => {
                if (!entry) return;
                onLoad(structuredClone(entry.scenario));
                setStatus("Loaded setup from the start of the Story.");
              })
            }
          >
            Load setup
          </button>
          <button
            className="btn btn-secondary"
            disabled={!entry}
            onClick={() =>
              run(() =>
                update(
                  entries.map((item) =>
                    item.id === selected ? { ...item, name } : item,
                  ),
                ),
              )
            }
          >
            Rename setup
          </button>
          <button
            className="btn btn-secondary"
            disabled={!entry || entries.length >= 20}
            onClick={() =>
              run(() => {
                if (!entry) return;
                let copyName = "",
                  count = 1;
                do {
                  copyName = `${entry.name.slice(0, 45)} (copy ${count++})`;
                } while (
                  entries.some(
                    (item) =>
                      item.name.toLowerCase() === copyName.toLowerCase(),
                  )
                );
                const copy = {
                  ...entry,
                  id: crypto.randomUUID(),
                  name: copyName,
                };
                update([...entries, copy]);
                setSelected(copy.id);
                setName(copyName);
              })
            }
          >
            Duplicate setup
          </button>
          <button
            className="btn btn-secondary"
            disabled={!entry}
            onClick={() =>
              run(() =>
                update(
                  entries.map((item) =>
                    item.id === selected
                      ? { ...item, scenario: current }
                      : item,
                  ),
                ),
              )
            }
          >
            Replace with current setup
          </button>
          <button
            className="btn btn-secondary"
            disabled={!entry}
            onClick={() =>
              run(() => {
                update(entries.filter((item) => item.id !== selected));
                setSelected("");
                setName("");
              })
            }
          >
            Delete setup
          </button>
        </div>
        {!!issues.length && (
          <div>
            <p>
              This setup needs attention before loading. Replace it with a valid
              current setup, or delete it.
            </p>
            <ul aria-label="Unavailable setup references">
              {issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </div>
        )}
        <p className="key-history-status" role="status">
          {status}
        </p>
      </details>
    </div>
  );
}
