import { itemLabel } from "../../../packages/domain/story-items";
import { useEffect, useState } from "react";
import { statId } from "../../../packages/contracts/index";
import type { StagedBattleStory } from "../../../packages/contracts/battle-graph";
import {
  previewScenarioSchema,
  type PreviewScenario,
} from "../../../packages/contracts/preview";
import { baseStats } from "../../../packages/domain/index";
import { previewItemIds } from "../../../packages/domain/preview";

export function PreviewStateEditor({
  story,
  scenario,
  onRestart,
}: {
  story: StagedBattleStory;
  scenario: PreviewScenario;
  onRestart: (scenario: PreviewScenario) => void;
}) {
  const [stats, setStats] = useState({ ...baseStats, ...scenario.stats });
  const [items, setItems] = useState({ ...scenario.items });
  const [message, setMessage] = useState("");
  const itemIds = previewItemIds(story);
  useEffect(() => {
    setStats({ ...baseStats, ...scenario.stats });
    setItems({ ...scenario.items });
  }, [scenario]);
  const parsed = previewScenarioSchema.safeParse({ ...scenario, stats, items });
  const restart = (next: PreviewScenario) => {
    try {
      onRestart(next);
      setMessage("Preview restarted with the selected starting values.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not restart preview.",
      );
    }
  };
  return (
    <details className="preview-state-editor">
      <summary>Test stats and inventory</summary>
      <p>
        Starting values only, before entry effects. Apply restarts this
        disposable preview. Real saves and account data are unchanged.
      </p>
      <fieldset className="preview-state-stats">
        <legend>Starting stats</legend>
        {statId.options.map((stat) => (
          <label key={stat}>
            {stat}
            <input
              aria-label={`Starting ${stat}`}
              type="number"
              min={1}
              max={20}
              step={1}
              value={Number.isNaN(stats[stat]) ? "" : stats[stat]}
              onChange={(e) => {
                setStats({ ...stats, [stat]: e.target.valueAsNumber });
                setMessage("");
              }}
            />
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Starting inventory</legend>
        <p>
          Only catalogued or referenced Story items. Zero means none; applying
          these values does not grant real items.
        </p>
        {itemIds.length === 0 && (
          <p>No catalogue entries or item references in this Story.</p>
        )}
        {itemIds.map((id) => (
          <label key={id}>
            {itemLabel(story, id)}
            <input
              aria-label={`Starting quantity ${id}`}
              type="number"
              min={0}
              max={999}
              step={1}
              value={Number.isNaN(items[id]) ? "" : (items[id] ?? 0)}
              onChange={(e) => {
                const next = { ...items };
                if (e.target.valueAsNumber === 0) delete next[id];
                else next[id] = e.target.valueAsNumber;
                setItems(next);
                setMessage("");
              }}
            />
          </label>
        ))}
      </fieldset>
      <button
        className="btn btn-primary"
        disabled={!parsed.success}
        onClick={() => {
          if (parsed.success) restart(parsed.data);
        }}
      >
        Apply stats and inventory
      </button>
      <button
        className="btn btn-secondary"
        onClick={() =>
          restart({ ...scenario, stats: { ...baseStats }, items: {} })
        }
      >
        Reset stats and inventory
      </button>
      <p role="status" className="key-history-status">
        {!parsed.success
          ? "Use whole-number stats from 1 to 20 and quantities from 0 to 999, with at most 40 starting items."
          : message}
      </p>
    </details>
  );
}
