import { useEffect, useRef, useState } from "react";
import type { createApi } from "../../../packages/api-client/index";

type ListedStory = { id: string; title: string };
export function ConsumerStoryPicker({
  api,
  label,
  selected,
  onChange,
  disabled = false,
}: {
  api: ReturnType<typeof createApi>;
  label: string;
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const [items, setItems] = useState<ListedStory[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  const generation = useRef(0);
  const load = async (after?: string) => {
    const token = ++generation.current;
    setBusy(true);
    try {
      const result = await api<{
        items: ListedStory[];
        nextCursor: string | null;
      }>(
        `/studio?limit=20${after ? `&cursor=${encodeURIComponent(after)}` : ""}`,
      );
      if (token !== generation.current) return;
      setItems((old) =>
        after
          ? [
              ...new Map(
                [...old, ...result.items].map((item) => [item.id, item]),
              ).values(),
            ]
          : result.items,
      );
      setCursor(result.nextCursor);
      setMessage("Saved Stories loaded.");
    } catch (e) {
      if (token === generation.current)
        setMessage(
          `${(e as Error).message} Retry loading; your selections are kept.`,
        );
    } finally {
      if (token === generation.current) setBusy(false);
    }
  };
  useEffect(() => {
    void load();
    return () => {
      generation.current++;
    };
  }, [api]);
  const needle = query.trim().toLocaleLowerCase();
  const visible = items.filter((item) =>
    `${item.title} ${item.id}`.toLocaleLowerCase().includes(needle),
  );
  return (
    <section className="consumer-story-picker" aria-label={label}>
      <h4>{label}</h4>
      <p>
        Choose up to 20 of your saved Stories. Search covers loaded results;
        load more to find others.
      </p>
      <label>
        Search loaded Stories
        <input
          type="search"
          aria-label={`${label}: search loaded Stories`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <p>{selected.length}/20 selected</p>
      <ul className="consumer-story-selections" aria-label="Selected Stories">
        {selected.map((id) => (
          <li key={id}>
            <span>{items.find((item) => item.id === id)?.title ?? id}</span>
            <button
              className="btn btn-secondary"
              disabled={disabled}
              onClick={() => onChange(selected.filter((value) => value !== id))}
              aria-label={`Remove Story ${id}`}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <div className="consumer-story-results">
        {visible.map((item) => (
          <label key={item.id}>
            <input
              type="checkbox"
              checked={selected.includes(item.id)}
              disabled={
                disabled ||
                (!selected.includes(item.id) && selected.length >= 20)
              }
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...selected, item.id]
                    : selected.filter((id) => id !== item.id),
                )
              }
            />
            <span>
              {item.title}
              <small>{item.id}</small>
            </span>
          </label>
        ))}
        {!busy && !visible.length && (
          <p>No matching Stories in the loaded results.</p>
        )}
      </div>
      <p className="key-history-status" role="status">
        {busy ? "Loading saved Stories…" : message}
      </p>
      <button
        className="btn btn-secondary"
        disabled={busy}
        onClick={() => void load()}
      >
        Reload Stories
      </button>
      {cursor && (
        <button
          className="btn btn-secondary"
          disabled={busy}
          onClick={() => void load(cursor)}
        >
          Load more Stories
        </button>
      )}
    </section>
  );
}
