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
            Award trigger
            <select
              aria-label={`Persistent key ${i + 1} trigger`}
              value={
                key.achievementStoryNodeId !== undefined
                  ? "achievement"
                  : "completions"
              }
              onChange={(e) =>
                update(
                  keys.map((k, n) =>
                    n !== i
                      ? k
                      : e.target.value === "achievement"
                        ? {
                            ...k,
                            afterCompletions: undefined,
                            achievementStoryNodeId:
                              Object.values(story.storyNodes).find(
                                (n) => n.kind === "ending",
                              )?.id ?? "",
                          }
                        : {
                            ...k,
                            achievementStoryNodeId: undefined,
                            afterCompletions: 1,
                          },
                  ),
                )
              }
            >
              <option value="completions">Completed journeys</option>
              <option value="achievement">
                Approved StoryLeaf achievement
              </option>
            </select>
          </label>
          {key.achievementStoryNodeId !== undefined ? (
            <>
              <label>
                Achievement ending
                <select
                  aria-label={`Persistent key ${i + 1} achievement ending`}
                  value={key.achievementStoryNodeId}
                  onChange={(e) =>
                    update(
                      keys.map((k, n) =>
                        n === i
                          ? { ...k, achievementStoryNodeId: e.target.value }
                          : k,
                      ),
                    )
                  }
                >
                  <option value="">Choose a StoryLeaf</option>
                  {Object.values(story.storyNodes)
                    .filter((n) => n.kind === "ending")
                    .map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.title}
                      </option>
                    ))}
                </select>
              </label>
              <p>
                Publish this binding, then submit that edition's ending for
                approval. Only future approved completions award this permanent
                key. Revoking approval stops new awards; earned keys remain.
              </p>
            </>
          ) : (
            <>
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
            </>
          )}
          <button onClick={() => update(keys.filter((_, n) => n !== i))}>
            Remove persistent key {i + 1}
          </button>
          <label>
            Allow checks from your other Stories (comma-separated Story IDs)
            <input
              aria-label={`Persistent key ${i + 1} export destinations`}
              key={(key.exportToStoryIds ?? []).join(",")}
              defaultValue={(key.exportToStoryIds ?? []).join(", ")}
              onBlur={(e) =>
                update(
                  keys.map((k, n) =>
                    n === i
                      ? {
                          ...k,
                          exportToStoryIds: e.target.value
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean),
                        }
                      : k,
                  ),
                )
              }
            />
          </label>
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
        different key; publish a new edition to apply changes. Save destination
        Stories first. Export permission in a published edition is permanent for
        that edition; it does not grant paid access.
      </p>
    </section>
  );
}
