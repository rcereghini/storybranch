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
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const alive = useRef(false);
  const locked = useRef(false);
  const current = useRef(story);
  current.current = story;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const bindings = story.accountKeys?.keys ?? [];
  const bind = async () => {
    if (locked.current) return;
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
        permissions must include this Story. Copy its definition ID from the
        source ending's account achievement settings.
      </p>
      <label>
        Achievement definition ID
        <input
          aria-label="Earned achievement definition ID"
          value={definitionId}
          disabled={busy}
          maxLength={128}
          onChange={(e) => setDefinitionId(e.target.value)}
        />
      </label>
      <button
        className="btn btn-secondary"
        disabled={busy || !definitionId.trim() || bindings.length >= 20}
        onClick={() => void bind()}
      >
        Bind earned account key
      </button>
      <p className="key-history-status" role="status">
        {busy ? "Checking achievement…" : message}
      </p>
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
