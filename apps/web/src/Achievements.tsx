import { useEffect, useRef, useState } from "react";
import type { createApi } from "../../../packages/api-client/index";
import type {
  AchievementDefinition,
  AchievementClaim,
} from "../../../packages/contracts/achievements";
type Api = ReturnType<typeof createApi>;

export function AchievementSubmission({
  api,
  storyId,
  versionId,
  storyNodeId,
  notify,
}: {
  api: Api;
  storyId: string;
  versionId: string;
  storyNodeId: string;
  notify: (message: string) => void;
}) {
  const [definition, setDefinition] = useState<AchievementDefinition | null>(
    null,
  );
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const pending = useRef<object | null>(null);
  useEffect(() => {
    let cancelled = false;
    api<{ definition: AchievementDefinition | null }>(
      `/achievement-submissions?${new URLSearchParams({ storyId, versionId, storyNodeId })}`,
    )
      .then(({ definition }) => {
        if (!cancelled) {
          setDefinition(definition);
          setTitle(definition?.title ?? "");
          setDescription(definition?.description ?? "");
          setLoaded(true);
        }
      })
      .catch((error) => {
        if (!cancelled) notify(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [api, storyId, versionId, storyNodeId]);
  const locked =
    !loaded ||
    busy ||
    !!pending.current ||
    definition?.status === "approved" ||
    definition?.status === "revoked";
  return (
    <section aria-label="Account achievement submission">
      <h3>Account achievement</h3>
      <p>
        Submit an achievement for this ending in {versionId}. An admin must
        approve it before future completions can earn it. It grants no paid
        access.
      </p>
      <p role="status">
        {loaded
          ? `Status: ${definition?.status ?? "Not submitted"}`
          : "Loading achievement…"}
      </p>
      {definition?.reviewReason && <p>Review: {definition.reviewReason}</p>}
      <label>
        Achievement title
        <input
          aria-label="Achievement title"
          value={title}
          maxLength={80}
          disabled={locked}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label>
        Achievement description
        <textarea
          aria-label="Achievement description"
          value={description}
          maxLength={500}
          disabled={locked}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <button
        disabled={
          !loaded ||
          busy ||
          !title.trim() ||
          ["approved", "revoked"].includes(definition?.status ?? "")
        }
        onClick={async () => {
          const command = pending.current ?? {
            idempotencyKey: crypto.randomUUID(),
            expectedRevision: definition?.revision ?? 0,
            storyId,
            versionId,
            storyNodeId,
            title,
            description,
          };
          pending.current = command;
          setBusy(true);
          try {
            setDefinition(
              await api<AchievementDefinition>(
                "/achievement-submissions",
                command,
              ),
            );
            pending.current = null;
            notify("Achievement submitted for approval.");
          } catch (error) {
            notify(
              (error as Error).message +
                " Retry the same submission, or reopen this ending to reload its status.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {pending.current ? "Retry submission" : "Submit for approval"}
      </button>
    </section>
  );
}

export function AdminAchievements({
  api,
  notify,
}: {
  api: Api;
  notify: (message: string) => void;
}) {
  const [items, setItems] = useState<AchievementDefinition[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const pending = useRef<{ id: string; command: object } | null>(null);
  const load = async (cursor?: string) => {
    setBusy(true);
    try {
      const data = await api<{
        items: AchievementDefinition[];
        nextCursor: string | null;
      }>(`/admin/achievements${cursor ? `?cursor=${cursor}` : ""}`);
      setItems((old) => (cursor ? [...old, ...data.items] : data.items));
      setNext(data.nextCursor);
    } catch (error) {
      notify((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void load();
  }, [api]);
  const review = async (
    item: AchievementDefinition,
    status: "approved" | "rejected" | "revoked",
  ) => {
    const request = pending.current ?? {
      id: item.id,
      command: {
        idempotencyKey: crypto.randomUUID(),
        expectedRevision: item.revision,
        status,
        reason: reasons[item.id],
      },
    };
    pending.current = request;
    setBusy(true);
    try {
      const result = await api<AchievementDefinition>(
        `/admin/achievements/${request.id}`,
        request.command,
      );
      setItems((old) => old.map((d) => (d.id === result.id ? result : d)));
      pending.current = null;
      notify("Achievement review saved.");
    } catch (error) {
      notify((error as Error).message + " Retry review or reload the list.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="achievement-reviews" aria-label="Achievement reviews">
      <p>
        Approve only achievements you authorize this Story to issue. Approval is
        scoped to the displayed edition; claims are once per account for the
        same StoryLeaf across editions.
      </p>
      <button
        disabled={busy}
        onClick={() => {
          pending.current = null;
          void load();
        }}
      >
        Reload achievements
      </button>
      {busy && (
        <div className="loading-overlay" role="status">
          Loading achievements…
        </div>
      )}
      {!busy && !items.length && <p>No achievement submissions.</p>}
      {items.map((item) => (
        <article className="panel" key={item.id}>
          <h2>{item.title}</h2>
          <p>{item.description}</p>
          <details>
            <summary>Published ending: {item.ending.title}</summary>
            <p>{item.ending.storyNodeType}</p>
            <p>{item.ending.transcript}</p>
          </details>
          <p>
            {item.storyId} · {item.versionId} · {item.storyNodeId}
          </p>
          <p>Status: {item.status}</p>
          <p>{item.reviewReason}</p>
          <label className="email-field">
            Review reason
            <input
              aria-label={`Review reason for ${item.title}`}
              maxLength={500}
              value={reasons[item.id] ?? ""}
              disabled={busy || !!pending.current}
              onChange={(e) =>
                setReasons({ ...reasons, [item.id]: e.target.value })
              }
            />
          </label>
          {(
            [
              ...(item.status === "pending" || item.status === "revoked"
                ? ["approved"]
                : []),
              ...(item.status === "pending" ? ["rejected"] : []),
              ...(item.status === "approved" ? ["revoked"] : []),
            ] as const
          ).map((status) => (
            <button
              key={status}
              disabled={
                busy ||
                !reasons[item.id]?.trim() ||
                (!!pending.current && pending.current.id !== item.id)
              }
              onClick={() =>
                void review(item, status as "approved" | "rejected" | "revoked")
              }
            >
              {pending.current?.id === item.id
                ? "Retry review"
                : status === "approved"
                  ? "Approve"
                  : status === "rejected"
                    ? "Reject"
                    : "Revoke"}
            </button>
          ))}
        </article>
      ))}
      {next && (
        <button disabled={busy} onClick={() => void load(next)}>
          More achievements
        </button>
      )}
    </section>
  );
}

export function AccountAchievements({ api }: { api: Api }) {
  const [items, setItems] = useState<
    Array<AchievementClaim & { revoked: boolean }>
  >([]);
  const [next, setNext] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = async (cursor?: string) => {
    setBusy(true);
    setError("");
    try {
      const data = await api<{
        items: typeof items;
        nextCursor: string | null;
      }>(`/achievements${cursor ? `?cursor=${cursor}` : ""}`);
      setItems((old) => (cursor ? [...old, ...data.items] : data.items));
      setNext(data.nextCursor);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void load();
  }, [api]);
  return (
    <section className="panel" aria-label="My account achievements">
      <h2>Account achievements</h2>
      <p>Verified accomplishments from completed Stories.</p>
      {busy && (
        <div className="loading-overlay" role="status">
          Loading achievements…
        </div>
      )}
      {error && (
        <p role="alert">
          {error}{" "}
          <button onClick={() => void load()}>Retry achievements</button>
        </p>
      )}
      {!busy && !error && !items.length && (
        <p>No account achievements earned yet.</p>
      )}
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <strong>{item.title}</strong>
            {item.revoked ? " — Revoked" : " — Earned"}
            <p>{item.description}</p>
          </li>
        ))}
      </ul>
      {next && (
        <button disabled={busy} onClick={() => void load(next)}>
          More achievements
        </button>
      )}
    </section>
  );
}
