import type { Story } from "../../../packages/contracts/index";

export function StoryProgressEditor({
  story,
  onChange,
}: {
  story: Story;
  onChange: (story: Story) => void;
}) {
  const keys = story.progression?.keys ?? [];
  const update = (next: typeof keys) =>
    onChange({ ...story, progression: { version: 1, keys: next } });
  return (
    <section aria-label="Persistent Story keys">
      <h3>Persistent Story keys</h3>
      <p>
        Reward completed journeys. These keys belong to each player and unlock
        options in their next run of this Story. Preview starts with none.
      </p>
      {keys.map((key, i) => (
        <fieldset key={i}>
          <legend>Persistent key {i + 1}</legend>
          <label>
            Key name
            <input
              aria-label={`Persistent key ${i + 1} name`}
              value={key.keyId.slice(story.id.length + 1)}
              onChange={(e) =>
                update(
                  keys.map((k, n) =>
                    n === i
                      ? { ...k, keyId: `${story.id}:${e.target.value}` }
                      : k,
                  ),
                )
              }
            />
          </label>
          <label>
            Reward label
            <input
              aria-label={`Persistent key ${i + 1} label`}
              maxLength={80}
              value={key.label}
              onChange={(e) =>
                update(
                  keys.map((k, n) =>
                    n === i ? { ...k, label: e.target.value } : k,
                  ),
                )
              }
            />
          </label>
          <label>
            Completed journeys required
            <input
              aria-label={`Persistent key ${i + 1} completions`}
              type="number"
              min={1}
              max={999}
              value={key.afterCompletions}
              onChange={(e) =>
                update(
                  keys.map((k, n) =>
                    n === i
                      ? { ...k, afterCompletions: Number(e.target.value) }
                      : k,
                  ),
                )
              }
            />
          </label>
          <button onClick={() => update(keys.filter((_, n) => n !== i))}>
            Remove persistent key {i + 1}
          </button>
        </fieldset>
      ))}
      <button
        disabled={keys.length >= 40}
        onClick={() => {
          let suffix = 1;
          while (keys.some((k) => k.keyId === `${story.id}:reward-${suffix}`))
            suffix++;
          update([
            ...keys,
            {
              keyId: `${story.id}:reward-${suffix}`,
              label: "Returning adventurer",
              afterCompletions: 5,
            },
          ]);
        }}
      >
        Add persistent key
      </button>
      <p>
        Use stable lowercase names with hyphens. Changing a name creates a
        different key; publish a new edition to apply changes.
      </p>
    </section>
  );
}
