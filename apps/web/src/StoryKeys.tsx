import { useEffect, useRef, useState } from "react";
import type { createApi } from "../../../packages/api-client/index";
import type {
  StoryProgressHistory,
  StoryKeyHistory,
} from "../../../packages/contracts/story-progress";
type Api = ReturnType<typeof createApi>;

// Each mounted list belongs to one account/Story. Ignore obsolete requests,
// including the first effect request discarded by React StrictMode.
function useHistory<T>(
  api: Api,
  endpoint: string,
  cursorParam: string,
  identity: (item: T) => string,
) {
  const [items, setItems] = useState<T[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(false);
  const generation = useRef(0);
  const loading = useRef(false);
  const load = async (after?: string) => {
    if (loading.current) return;
    loading.current = true;
    const scope = generation.current;
    setBusy(true);
    setError(false);
    try {
      const data = await api<{ items: T[]; nextCursor: string | null }>(
        endpoint +
          (after ? `?${cursorParam}=${encodeURIComponent(after)}` : ""),
      );
      if (scope !== generation.current) return;
      setItems((old) =>
        after
          ? [
              ...new Map(
                [...old, ...data.items].map((item) => [identity(item), item]),
              ).values(),
            ]
          : data.items,
      );
      setCursor(data.nextCursor);
    } catch {
      if (scope === generation.current) setError(true);
    } finally {
      if (scope === generation.current) {
        loading.current = false;
        setBusy(false);
      }
    }
  };
  useEffect(() => {
    void load();
    return () => {
      generation.current++;
      loading.current = false;
    };
  }, [api, endpoint]);
  return {
    items,
    cursor,
    busy,
    error,
    more: () => void load(cursor ?? undefined),
  };
}

function EarnedKeys({
  api,
  story,
  onResume,
}: {
  api: Api;
  story: StoryProgressHistory["items"][number];
  onResume: (id: string) => void;
}) {
  const { items, cursor, busy, error, more } = useHistory<
    StoryKeyHistory["items"][number]
  >(api, `/story-progress/${story.storyId}/keys`, "afterKey", (k) => k.keyId);
  return (
    <section aria-label={`Keys earned in ${story.title}`}>
      <h3>{story.title}</h3>
      <p>
        {story.completions} completed{" "}
        {story.completions === 1 ? "journey" : "journeys"}
      </p>
      <ul className="earned-key-list">
        {items.map((key) => (
          <li key={key.keyId}>
            <strong>{key.label}</strong>
            <p>
              {key.source === "achievement"
                ? "Approved achievement"
                : "Completed journeys"}{" "}
              · {new Date(key.earnedAt).toLocaleDateString()}
            </p>
            <button
              className="btn btn-secondary btn-small"
              onClick={() => onResume(key.runId)}
            >
              View earning journey
            </button>
          </li>
        ))}
      </ul>
      <div className="key-history-status" role="status">
        {busy
          ? "Loading earned keys…"
          : error
            ? "Could not load earned keys."
            : !items.length
              ? "No persistent keys earned in this Story yet."
              : "Earned keys are permanent. New journeys use the keys declared by their edition."}
      </div>
      {(cursor || error) && (
        <button className="btn btn-secondary" disabled={busy} onClick={more}>
          {error ? "Retry earned keys" : "More earned keys"}
        </button>
      )}
    </section>
  );
}

export function StoryKeys({
  api,
  onResume,
}: {
  api: Api;
  onResume: (id: string) => void;
}) {
  const { items, cursor, busy, error, more } = useHistory<
    StoryProgressHistory["items"][number]
  >(api, "/story-progress", "cursor", (s) => s.storyId);
  const [selected, setSelected] = useState<
    StoryProgressHistory["items"][number] | null
  >(null);
  return (
    <section
      className="panel story-key-history"
      aria-label="My earned Story keys"
    >
      <h2>Earned Story keys</h2>
      <p>
        Your permanent rewards across journeys. Keys found in a single
        playthrough stay with that journey.
      </p>
      <div className="key-story-list" aria-label="Stories with progress">
        {items.map((story) => (
          <button
            key={story.storyId}
            className="btn btn-secondary"
            aria-pressed={selected?.storyId === story.storyId}
            onClick={() => setSelected(story)}
          >
            {story.title}
          </button>
        ))}
      </div>
      <div className="key-history-status" role="status">
        {busy
          ? "Loading your Stories…"
          : error
            ? "Could not load Story progress."
            : !items.length
              ? "Complete a Story to start your key history."
              : !selected
                ? "Choose a Story to see its earned keys."
                : ""}
      </div>
      {(cursor || error) && (
        <button className="btn btn-secondary" disabled={busy} onClick={more}>
          {error ? "Retry Story progress" : "More Stories"}
        </button>
      )}
      {selected && (
        <EarnedKeys
          key={selected.storyId}
          api={api}
          story={selected}
          onResume={onResume}
        />
      )}
    </section>
  );
}
