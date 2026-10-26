import type { Story } from "../../../packages/contracts/index";

export function StoryKeyImports({
  story,
  onChange,
}: {
  story: Story;
  onChange: (s: Story) => void;
}) {
  const keys = story.keyImports?.keys ?? [];
  const update = (next: typeof keys) =>
    onChange({ ...story, keyImports: { version: 1, keys: next } });
  return (
    <section aria-label="Imported Story keys">
      <h3>Imported Story keys</h3>
      <p>
        Check exported keys from another Story you own. Publish its export
        permission first, then enter that edition below. Players approve these
        checks before starting. Preview uses no imported keys.
      </p>
      {keys.map((key, i) => (
        <fieldset key={i}>
          <legend>Imported key {i + 1}</legend>
          <label>
            Source of the key
            <select
              aria-label={`Imported key ${i + 1} source mode`}
              value={key.selection ?? "ever-earned"}
              onChange={(e) =>
                update(
                  keys.map((k, n) =>
                    n === i
                      ? {
                          ...k,
                          selection: e.target.value as
                            | "ever-earned"
                            | "completed-run",
                        }
                      : k,
                  ),
                )
              }
            >
              <option value="ever-earned">Permanent key ever earned</option>
              <option value="completed-run">
                Local key in a selected completed journey
              </option>
            </select>
          </label>
          {(
            [
              ["keyId", "Local key name", key.keyId.slice(story.id.length + 1)],
              ["label", "Label", key.label],
              ["sourceStoryId", "Source Story ID", key.sourceStoryId],
              ["sourceVersionId", "Source edition", key.sourceVersionId],
              ["sourceKeyId", "Source key ID", key.sourceKeyId],
            ] as const
          ).map(([field, label, value]) => (
            <label key={field}>
              {label}
              <input
                aria-label={`Imported key ${i + 1} ${label.toLowerCase()}`}
                maxLength={100}
                value={value}
                onChange={(e) =>
                  update(
                    keys.map((k, n) =>
                      n === i
                        ? {
                            ...k,
                            [field]:
                              field === "keyId"
                                ? `${story.id}:${e.target.value}`
                                : e.target.value,
                          }
                        : k,
                    ),
                  )
                }
              />
            </label>
          ))}
          <label>
            <input
              type="checkbox"
              checked={key.required}
              onChange={(e) =>
                update(
                  keys.map((k, n) =>
                    n === i ? { ...k, required: e.target.checked } : k,
                  ),
                )
              }
            />{" "}
            {key.selection === "completed-run"
              ? "Require a completed source journey (the key may be absent)"
              : "Require this earned key to start"}
          </label>
          <button onClick={() => update(keys.filter((_, n) => n !== i))}>
            Remove imported key {i + 1}
          </button>
        </fieldset>
      ))}
      <button
        disabled={keys.length >= 20}
        onClick={() => {
          let suffix = 1;
          while (keys.some((k) => k.keyId === `${story.id}:import-${suffix}`))
            suffix++;
          update([
            ...keys,
            {
              keyId: `${story.id}:import-${suffix}`,
              label: "Returning hero",
              sourceStoryId: "source-story",
              sourceVersionId: "edition-1",
              sourceKeyId: "source-story:reward-1",
              required: false,
            },
          ]);
        }}
      >
        Add imported key
      </button>
      <p>
        Optional missing or declined imports are false. Selected-journey imports
        use one chosen run per source edition; a missing local key is a valid
        false result.
      </p>
    </section>
  );
}

export function StoryRunExports({
  story,
  onChange,
}: {
  story: Story;
  onChange: (s: Story) => void;
}) {
  const keys = story.runKeyExports?.keys ?? [];
  const update = (next: typeof keys) =>
    onChange({ ...story, runKeyExports: { version: 1, keys: next } });
  return (
    <section aria-label="Completed journey exports">
      <h3>Completed journey exports</h3>
      <p>
        Allow a sequel you own to check local keys in a completed journey the
        player selects. This exports only whether a key was present, including
        keys awarded at the ending.
      </p>
      {keys.map((k, i) => (
        <fieldset key={i}>
          <legend>Run export {i + 1}</legend>
          <label>
            Local key name
            <input
              aria-label={`Run export ${i + 1} key`}
              value={k.keyId.slice(story.id.length + 1)}
              onChange={(e) =>
                update(
                  keys.map((key, n) =>
                    n === i
                      ? { ...key, keyId: `${story.id}:${e.target.value}` }
                      : key,
                  ),
                )
              }
            />
          </label>
          <label>
            Label
            <input
              aria-label={`Run export ${i + 1} label`}
              maxLength={80}
              value={k.label}
              onChange={(e) =>
                update(
                  keys.map((key, n) =>
                    n === i ? { ...key, label: e.target.value } : key,
                  ),
                )
              }
            />
          </label>
          <label>
            Allowed destination Story IDs (comma-separated)
            <input
              aria-label={`Run export ${i + 1} destinations`}
              key={k.exportToStoryIds.join(",")}
              defaultValue={k.exportToStoryIds.join(", ")}
              onBlur={(e) =>
                update(
                  keys.map((key, n) =>
                    n === i
                      ? {
                          ...key,
                          exportToStoryIds: e.target.value
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean),
                        }
                      : key,
                  ),
                )
              }
            />
          </label>
          <button onClick={() => update(keys.filter((_, n) => n !== i))}>
            Remove run export {i + 1}
          </button>
        </fieldset>
      ))}
      <button
        disabled={keys.length >= 20}
        onClick={() => {
          let suffix = 1;
          while (keys.some((k) => k.keyId === `${story.id}:fact-${suffix}`))
            suffix++;
          update([
            ...keys,
            {
              keyId: `${story.id}:fact-${suffix}`,
              label: "Story fact",
              exportToStoryIds: [],
            },
          ]);
        }}
      >
        Add run export
      </button>
      <p>
        Save destination Stories first. Publish a new edition before players
        earn these exportable facts. Permission in that edition is permanent.
      </p>
    </section>
  );
}
