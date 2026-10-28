import { useState } from "react";
import {
  battlePlaytestReplaySchema,
  savedGraphPlaytestsSchema,
  type SavedGraphPlaytest,
} from "../../../packages/contracts/battle-playtest";
import type { PreviewScenario } from "../../../packages/contracts/preview";

export function SavedGraphPlaytests({
  entries,
  scenario,
  replay,
  onChange,
  onLoad,
}: {
  entries: SavedGraphPlaytest[];
  scenario: PreviewScenario;
  replay: string;
  onChange: (entries: SavedGraphPlaytest[]) => void;
  onLoad: (entry: SavedGraphPlaytest) => void;
}) {
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState("");
  const entry = entries.find((e) => e.id === selected);
  const attempt = (work: () => void, message: string) => {
    try {
      work();
      setStatus(message);
    } catch (error) {
      setStatus(
        error instanceof Error && error.name !== "ZodError"
          ? error.message
          : "Use a unique name, a valid setup and valid assertion JSON within the saved playtest limits.",
      );
    }
  };
  const save = (id: string) => {
    const next = {
      version: 1 as const,
      id,
      name,
      scenario,
      ...(replay.trim()
        ? { replay: battlePlaytestReplaySchema.parse(JSON.parse(replay)) }
        : {}),
    };
    const updated = entries.some((e) => e.id === id)
      ? entries.map((e) => (e.id === id ? next : e))
      : [...entries, next];
    onChange(savedGraphPlaytestsSchema.parse(updated));
    setSelected(id);
  };
  return (
    <details>
      <summary>Saved graph playtests</summary>
      <p>
        Save the applied setup and assertion JSON, not unapplied controls or
        current progress. Close preview and Save battle draft to persist
        changes.
      </p>
      <label>
        Saved playtest
        <select
          aria-label="Saved graph playtest"
          value={selected}
          onChange={(event) => {
            setSelected(event.target.value);
            setName(
              entries.find((e) => e.id === event.target.value)?.name ?? "",
            );
            setStatus("");
          }}
        >
          <option value="">Select a playtest</option>
          {entries.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Playtest name
        <input
          aria-label="Graph playtest name"
          maxLength={60}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <button
        className="btn btn-primary"
        disabled={entries.length >= 10 || !name.trim()}
        onClick={() =>
          attempt(
            () => save(crypto.randomUUID()),
            "Playtest added to draft. Close preview and save the draft.",
          )
        }
      >
        Save new graph playtest
      </button>
      <button
        className="btn btn-secondary"
        disabled={!entry || !name.trim()}
        onClick={() =>
          attempt(
            () => save(selected),
            "Playtest updated in draft. Close preview and save the draft.",
          )
        }
      >
        Update graph playtest
      </button>
      <button
        className="btn btn-secondary"
        disabled={!entry}
        onClick={() =>
          attempt(
            () => onLoad(entry!),
            "Playtest loaded and checked against the current graph.",
          )
        }
      >
        Load graph playtest
      </button>
      <button
        className="btn btn-secondary"
        disabled={!entry}
        onClick={() =>
          attempt(() => {
            onChange(entries.filter((e) => e.id !== selected));
            setSelected("");
            setName("");
          }, "Playtest removed from draft. Close preview and save the draft.")
        }
      >
        Remove graph playtest
      </button>
      <p role="status" className="battle-workshop-status">
        {status}
      </p>
    </details>
  );
}
