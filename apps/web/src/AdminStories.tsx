import { useEffect, useState } from "react";
import type { createApi } from "../../../packages/api-client/index";
import type {
  AdminAuditEntry,
  AdminStory,
  AdminStoryDetail,
} from "../../../packages/contracts/admin";

type Api = ReturnType<typeof createApi>;
const percent = (players: number, finishers: number) =>
  players ? `${Math.round((finishers / players) * 100)}%` : "—";

export function AdminStories({
  api,
  navigate,
  onNotice,
  onChanged,
  describe,
}: {
  api: Api;
  navigate: (path: string) => void;
  onNotice: (message: string) => void;
  onChanged: () => void;
  describe: (entry: AdminAuditEntry) => string;
}) {
  const [stories, setStories] = useState<AdminStory[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminStoryDetail | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () =>
    setStories((await api<{ items: AdminStory[] }>("/admin/stories")).items);
  useEffect(() => {
    load().catch((error) => onNotice((error as Error).message));
  }, []);
  const openDetail = async (id: string) => {
    setOpen(id);
    setDetail(null);
    try {
      setDetail(await api<AdminStoryDetail>(`/admin/stories/${id}`));
    } catch (error) {
      onNotice((error as Error).message);
    }
  };
  const setHidden = async (id: string, hidden: boolean) => {
    setBusy(id);
    onNotice("");
    try {
      await api(`/admin/stories/${id}`, {
        idempotencyKey: crypto.randomUUID(),
        hidden,
      });
      setStories(
        (current) =>
          current?.map((s) => (s.id === id ? { ...s, hidden } : s)) ?? null,
      );
      if (open === id) await openDetail(id);
      onChanged();
    } catch (error) {
      onNotice((error as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const hideButton = (story: AdminStory) => (
    <button
      className="admin-action"
      disabled={busy === story.id}
      onClick={() => void setHidden(story.id, !story.hidden)}
    >
      {story.hidden ? "Show in Discover" : "Hide from Discover"}
    </button>
  );

  if (open) {
    const story = detail?.story;
    return (
      <section className="panel admin-user">
        <button className="admin-link" onClick={() => setOpen(null)}>
          ← All stories
        </button>
        {detail && story ? (
          <>
            <div className="row-head">
              <div>
                <h2 className="panel-title">{story.title}</h2>
                <span className="admin-sub">{story.description}</span>
              </div>
              <span
                className={`admin-badge ${story.hidden ? "admin-disabled" : "admin-active"}`}
              >
                {story.hidden ? "Hidden" : "Listed"}
              </span>
            </div>
            <dl className="admin-facts">
              <dt>Creator</dt>
              <dd>{story.creatorEmail ?? story.creatorUid ?? "Storybranch"}</dd>
              {story.genre && (
                <>
                  <dt>Genre</dt>
                  <dd>{story.genre}</dd>
                </>
              )}
              {story.duration && (
                <>
                  <dt>Length</dt>
                  <dd>{story.duration}</dd>
                </>
              )}
              <dt>Story ID</dt>
              <dd>
                <code>{story.id}</code>
              </dd>
            </dl>
            <div className="email-actions">
              <button
                className="admin-action"
                onClick={() => navigate(`/s/${story.id}`)}
              >
                Open story page
              </button>
              {hideButton(story)}
            </div>
            <p className="admin-sub">
              Hiding removes a story from Discover and stops new playthroughs;
              players who already started keep their saves.
            </p>

            <h3 className="admin-subtitle">Play</h3>
            <div className="admin-stats">
              {(
                [
                  ["Players", detail.stats.players],
                  ["Finished", detail.stats.finishers],
                  [
                    "Completion",
                    percent(detail.stats.players, detail.stats.finishers),
                  ],
                  ["Played, 30 days", detail.stats.recentPlayers],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="panel admin-stat">
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
            <p className="admin-sub">
              Last played:{" "}
              {detail.stats.lastPlayedAt
                ? new Date(detail.stats.lastPlayedAt).toLocaleString()
                : "never"}
              . Each account counts once.
            </p>

            <h3 className="admin-subtitle">Editions</h3>
            <p className="admin-sub">
              A published edition never changes; players stay on the edition
              they started.
            </p>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Edition</th>
                    <th>StoryNodes</th>
                    <th>Players</th>
                    <th>Finished</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.editions.map((e) => (
                    <tr key={e.versionId}>
                      <td>
                        <code>{e.versionId}</code>
                        <span className="admin-sub">
                          {e.title}
                          {e.current ? " · current" : ""}
                        </span>
                      </td>
                      <td>{e.storyNodes}</td>
                      <td>{e.players}</td>
                      <td>{e.finishers}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!detail.editions.length && (
                <p className="admin-empty">No published editions.</p>
              )}
            </div>

            <h3 className="admin-subtitle">Admin changes</h3>
            {detail.audit.length ? (
              <ul className="admin-audit">
                {detail.audit.map((entry) => (
                  <li key={entry.id}>
                    <span>
                      <strong>{entry.actorEmail ?? entry.actorUid}</strong>{" "}
                      {describe(entry)}
                    </span>
                    <time>{new Date(entry.at).toLocaleString()}</time>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="admin-empty">No admin changes to this story.</p>
            )}
          </>
        ) : (
          <div className="admin-placeholder" aria-hidden="true" />
        )}
      </section>
    );
  }

  return (
    <section className="panel">
      <h2 className="panel-title">Published stories</h2>
      {stories ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Story</th>
                <th>Creator</th>
                <th>Players</th>
                <th>Completion</th>
                <th>Discover</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {stories.map((story) => (
                <tr key={story.id}>
                  <td>
                    <button
                      className="admin-link"
                      onClick={() => void openDetail(story.id)}
                    >
                      {story.title}
                    </button>
                    <code className="admin-sub">{story.id}</code>
                  </td>
                  <td>
                    {story.creatorEmail ?? story.creatorUid ?? "Storybranch"}
                  </td>
                  <td>{story.players}</td>
                  <td>{percent(story.players, story.finishers)}</td>
                  <td>
                    <span
                      className={`admin-badge ${story.hidden ? "admin-disabled" : "admin-active"}`}
                    >
                      {story.hidden ? "Hidden" : "Listed"}
                    </span>
                  </td>
                  <td>{hideButton(story)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="admin-empty">
            Hiding removes a story from Discover and stops new playthroughs;
            players who already started keep their saves. Open a story for its
            editions and history.
          </p>
        </div>
      ) : (
        <div className="admin-placeholder" aria-hidden="true" />
      )}
    </section>
  );
}
