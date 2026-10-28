import { useEffect, useState } from "react";
import type { StagedBattleStory } from "../../../packages/contracts/battle-graph";
import type { PreviewScenario } from "../../../packages/contracts/preview";

export function GraphPreviewKeys({
  story,
  scenario,
  onRestart,
}: {
  story: StagedBattleStory;
  scenario: PreviewScenario;
  onRestart: (scenario: PreviewScenario) => void;
}) {
  const [draft, setDraft] = useState(scenario);
  const [status, setStatus] = useState("");
  useEffect(() => {
    setDraft(scenario);
    setStatus("");
  }, [scenario]);
  return (
    <details className="graph-preview-keys">
      <summary>Test graph keys</summary>
      <p>
        Simulated aliases only. Real ownership, consent, expiry and approval are
        not checked and no access is granted. Apply restarts the preview.
      </p>
      {(
        [
          ["storyKeys", "Story keys", story.progression?.keys ?? []],
          ["importedKeys", "Imported facts", story.keyImports?.keys ?? []],
          ["accountKeys", "Account keys", story.accountKeys?.keys ?? []],
        ] as const
      ).map(([field, title, keys]) => (
        <fieldset key={field}>
          <legend>{title}</legend>
          {!keys.length && <p>No {title.toLowerCase()} declared.</p>}
          {keys.map((key) => (
            <label key={key.keyId}>
              <input
                type="checkbox"
                aria-label={`Simulate ${key.keyId}`}
                checked={draft[field].includes(key.keyId)}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    [field]: event.target.checked
                      ? [...draft[field], key.keyId]
                      : draft[field].filter((id) => id !== key.keyId),
                  })
                }
              />
              {key.label}
            </label>
          ))}
        </fieldset>
      ))}
      <button
        className="btn btn-primary"
        onClick={() => {
          try {
            onRestart({
              ...scenario,
              storyKeys: draft.storyKeys,
              importedKeys: draft.importedKeys,
              accountKeys: draft.accountKeys,
            });
          } catch (error) {
            setStatus(
              error instanceof Error ? error.message : "Could not apply keys.",
            );
          }
        }}
      >
        Apply graph keys
      </button>
      <button
        className="btn btn-secondary"
        onClick={() => {
          setDraft(scenario);
          setStatus("");
        }}
      >
        Reset key edits
      </button>
      <p role="status" className="battle-workshop-status">
        {status}
      </p>
    </details>
  );
}
