import type { Story, Save } from "../../../packages/contracts/index";
import type { PreviewScenario } from "../../../packages/contracts/preview";
import {
  previewPreset,
  previewOptions,
} from "../../../packages/domain/preview";

export function PreviewKeys({
  story,
  save,
  scenario,
  onRestart,
}: {
  story: Story;
  save: Save;
  scenario: PreviewScenario;
  onRestart: (scenario: PreviewScenario) => void;
}) {
  return (
    <div className="preview-key-tools">
      <details>
        <summary>Test key scenarios</summary>
        <p>
          Simulated facts only. Every change restarts this preview. Real
          ownership, consent and approval are not checked.
        </p>
        <div className="preview-key-presets">
          <button
            className="btn btn-secondary"
            onClick={() => onRestart(previewPreset(story, "first"))}
          >
            First playthrough
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => onRestart(previewPreset(story, "returning"))}
          >
            Returning player
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => onRestart(previewPreset(story, "sequel"))}
          >
            Sequel with item
          </button>
        </div>
        <p>
          Returning player enables all declared Story keys. Sequel with item
          enables all declared imported facts. Adjust the selections below to
          test a specific path.
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
                  checked={scenario[field].includes(key.keyId)}
                  onChange={(e) =>
                    onRestart({
                      ...scenario,
                      [field]: e.target.checked
                        ? [...scenario[field], key.keyId]
                        : scenario[field].filter((id) => id !== key.keyId),
                    })
                  }
                />
                {key.label} <small>{key.keyId}</small>
              </label>
            ))}
          </fieldset>
        ))}
      </details>
      <details>
        <summary>Why these options?</summary>
        <p>
          Creator-only diagnostics for the current preview. Unfinished paths
          remain excluded; see Publication review in the editor.
        </p>
        <ul aria-label="Preview option diagnostics">
          {previewOptions(story, save, scenario.accountKeys).map((option) => (
            <li key={option.id}>
              <strong>
                {option.label} — {option.status}
              </strong>
              <p>{option.reason}</p>
              {option.checks.length > 0 && (
                <ul aria-label={"Condition checks for " + option.label}>
                  {option.checks.map((check) => (
                    <li key={check.path}>
                      <strong>
                        {check.met ? "Pass" : "Fail"} {check.path}
                      </strong>
                      : {check.description}
                      {check.actual ? ". " + check.actual + "." : "."}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
        {save.status === "completed" && (
          <p>
            This StoryLeaf completes the preview. No account rewards were
            granted.
          </p>
        )}
      </details>
    </div>
  );
}
