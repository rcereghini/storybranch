import { useEffect, useState } from "react";
import {
  previewDiceSchema,
  type PreviewScenario,
} from "../../../packages/contracts/preview";

export function PreviewDiceEditor({
  scenario,
  onRestart,
}: {
  scenario: PreviewScenario;
  onRestart: (scenario: PreviewScenario) => void;
}) {
  const [mode, setMode] = useState(scenario.dice?.mode ?? "highest");
  const [value, setValue] = useState(
    scenario.dice?.mode === "fixed" ? scenario.dice.value : 1,
  );
  const [message, setMessage] = useState("");
  useEffect(() => {
    setMode(scenario.dice?.mode ?? "highest");
    setValue(scenario.dice?.mode === "fixed" ? scenario.dice.value : 1);
    setMessage("");
  }, [scenario]);
  const parsed = previewDiceSchema.safeParse(
    mode === "fixed" ? { mode, value } : { mode },
  );
  return (
    <details>
      <summary>Test Dice outcomes</summary>
      <p>
        Applying restarts the preview. A fixed draw must fit each die you roll.
      </p>
      <label>
        Dice mode
        <select
          aria-label="Preview Dice mode"
          value={mode}
          onChange={(event) => setMode(event.target.value as typeof mode)}
        >
          <option value="highest">Highest</option>
          <option value="lowest">Lowest</option>
          <option value="fixed">Fixed</option>
        </select>
      </label>
      {mode === "fixed" && (
        <label>
          Fixed draw
          <input
            aria-label="Preview fixed draw"
            type="number"
            min={1}
            max={100}
            step={1}
            value={Number.isNaN(value) ? "" : value}
            onChange={(event) => setValue(event.target.valueAsNumber)}
          />
        </label>
      )}
      <button
        className="btn btn-primary"
        disabled={!parsed.success}
        onClick={() => {
          if (!parsed.success) return;
          try {
            onRestart({ ...scenario, dice: parsed.data });
          } catch (error) {
            setMessage(
              error instanceof Error
                ? error.message
                : "Could not restart preview.",
            );
          }
        }}
      >
        Apply Dice setup
      </button>
      <button
        className="btn btn-secondary"
        onClick={() => {
          setMode(scenario.dice?.mode ?? "highest");
          setValue(scenario.dice?.mode === "fixed" ? scenario.dice.value : 1);
          setMessage("");
        }}
      >
        Reset Dice edits
      </button>
      <p className="key-history-status" role="status">
        {!parsed.success ? "Use a whole-number draw from 1 to 100." : message}
      </p>
    </details>
  );
}
