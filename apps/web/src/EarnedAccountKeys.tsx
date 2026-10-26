import { useEffect, useRef, useState } from "react";
import type { createApi } from "../../../packages/api-client/index";
import type { Story } from "../../../packages/contracts/index";
import type { AchievementDefinition } from "../../../packages/contracts/achievements";

export function EarnedAccountKeys({
  api,
  story,
  onChange,
}: {
  api: ReturnType<typeof createApi>;
  story: Story;
  onChange: (story: Story) => void;
}) {
  const [definitionId, setDefinitionId] = useState("");
  const [busy, setBusy] = useState(true);
  const [items, setItems] = useState<AchievementDefinition[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const alive = useRef(false);
  const locked = useRef(false);
  const request = useRef(0);
  const current = useRef(story);
  current.current = story;
  const load = async (after?: string) => {
    const token = ++request.current;
    setBusy(true);
    try {
      const result = await api<{
        items: AchievementDefinition[];
        nextCursor: string | null;
      }>(
        `/achievement-submissions${after ? `?cursor=${encodeURIComponent(after)}` : ""}`,
      );
      if (!alive.current || token !== request.current) return;
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
      setMessage(
        result.nextCursor
          ? "More achievements are available. Load more if yours is not listed."
          : "Achievements loaded.",
      );
    } catch (e) {
      if (alive.current && token === request.current)
        setMessage(
          `${(e as Error).message} Try loading again; your existing choices are kept.`,
        );
    } finally {
      if (alive.current && token === request.current) setBusy(false);
    }
  };
  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
      request.current++;
    };
  }, [api, story.id]);
  const bindings = story.accountKeys?.keys ?? [];
  const eligible = items.filter(
    (d) =>
      d.status === "approved" &&
      d.consumerStoryIds?.includes(story.id) &&
      !bindings.some(
        (k) => k.source === "achievement" && k.definitionId === d.id,
      ),
  );
  const bind = async () => {
    if (locked.current || busy || !eligible.some((d) => d.id === definitionId))
      return;
    locked.current = true;
    setBusy(true);
    setMessage("");
    try {
      const d = await api<AchievementDefinition>(
        `/achievement-submissions/${encodeURIComponent(definitionId.trim())}`,
      );
      if (!alive.current) return;
      const latest = current.current;
      const keys = latest.accountKeys?.keys ?? [];
      if (d.status !== "approved" || !d.consumerStoryIds?.includes(latest.id))
        throw new Error(
          "Choose an approved achievement that permits this Story.",
        );
      if (
        keys.length >= 20 ||
        keys.some((k) => k.source === "achievement" && k.definitionId === d.id)
      )
        throw new Error(
          "This achievement is already bound, or the account alias limit is reached.",
        );
      let suffix = 1;
      while (keys.some((k) => k.keyId === `${latest.id}:earned-${suffix}`))
        suffix++;
      onChange({
        ...latest,
        accountKeys: {
          version: 1,
          keys: [
            ...keys,
            {
              keyId: `${latest.id}:earned-${suffix}`,
              label: d.title,
              definitionId: d.id,
              source: "achievement",
            },
          ],
        },
      });
      setMessage(
        "Achievement bound. Select it in an option condition and publish a new edition.",
      );
      setDefinitionId("");
    } catch (e) {
      if (alive.current) setMessage((e as Error).message);
    } finally {
      locked.current = false;
      if (alive.current) setBusy(false);
    }
  };
  return (
    <section
      className="promotional-keys"
      aria-label="Earned account key settings"
    >
      <h3>Earned account keys</h3>
      <p>
        Use an approved achievement from one of your Stories. Its reviewed
        permissions must include this Story.
      </p>
      <label>
        Approved achievement
        <select
          aria-label="Approved achievement"
          value={definitionId}
          disabled={busy}
          onChange={(e) => setDefinitionId(e.target.value)}
        >
          <option value="">Choose an achievement</option>
          {eligible.map((d) => (
            <option key={d.id} value={d.id}>
              {d.title} · {d.versionId}
            </option>
          ))}
        </select>
      </label>
      <button
        className="btn btn-secondary"
        disabled={
          busy ||
          !eligible.some((d) => d.id === definitionId) ||
          bindings.length >= 20
        }
        onClick={() => void bind()}
      >
        Bind earned account key
      </button>
      <p className="key-history-status" role="status">
        {busy ? "Loading or checking achievements…" : message}
      </p>
      {!busy && !eligible.length && (
        <p>
          No eligible achievements in the loaded results. Submit consumer
          permissions for approval, or load more results.
        </p>
      )}
      <button
        className="btn btn-secondary"
        disabled={busy}
        onClick={() => void load()}
      >
        Reload eligible achievements
      </button>
      {cursor && (
        <button
          className="btn btn-secondary"
          disabled={busy}
          onClick={() => void load(cursor)}
        >
          Load more achievements
        </button>
      )}
      {bindings
        .filter((k) => k.source === "achievement")
        .map((key) => (
          <p key={key.keyId}>
            {key.label} · {key.keyId}{" "}
            <button
              className="btn btn-secondary"
              onClick={() =>
                onChange({
                  ...story,
                  accountKeys: {
                    version: 1,
                    keys: bindings.filter((k) => k.keyId !== key.keyId),
                  },
                })
              }
            >
              Remove earned alias {key.label}
            </button>
          </p>
        ))}
      <p>
        Players earn these keys through approved StoryLeaf achievements.
        Revocation disables future gated options; their historical achievements
        and committed progress remain.
      </p>
    </section>
  );
}
