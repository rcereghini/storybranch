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
        Check permanent keys earned in another Story you own. Publish its export
        permission first, then enter that edition below. Players approve these
        checks before starting. Preview uses no imported keys.
      </p>
      {keys.map((key, i) => (
        <fieldset key={i}>
          <legend>Imported key {i + 1}</legend>
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
            Require this earned key to start
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
        Optional missing or declined keys are false. These are ever-earned
        checks; they do not select a past journey or transfer its items.
      </p>
    </section>
  );
}
