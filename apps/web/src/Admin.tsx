import { useEffect, useState } from "react";
import type { createApi } from "../../../packages/api-client/index";
import type {
  AdminAuditEntry,
  AdminOverview,
  AdminStory,
  AdminUser,
} from "../../../packages/contracts/admin";
import {
  featureIds,
  type FeatureId,
  type Features,
} from "../../../packages/contracts/profile";
import "./admin.css";

type Api = ReturnType<typeof createApi>;
type Tab = "overview" | "users" | "stories" | "activity";
const tabs: Array<[Tab, string]> = [
  ["overview", "Overview"],
  ["users", "Users"],
  ["stories", "Stories"],
  ["activity", "Activity"],
];
const featureLabels: Record<FeatureId, string> = {
  publish: "Publish",
  generate: "Generate",
  copilot: "Copilot",
  admin: "Admin",
};
const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString() : "—";

function describe(entry: AdminAuditEntry) {
  const change = entry.change as {
    features?: Partial<Features>;
    status?: string;
    hidden?: boolean;
  };
  if (entry.action === "story")
    return `${change.hidden ? "hid" : "showed"} story ${entry.target} ${change.hidden ? "from" : "in"} Discover`;
  const parts = [
    ...Object.entries(change.features ?? {}).map(
      ([feature, on]) =>
        `${on ? "turned on" : "turned off"} ${featureLabels[feature as FeatureId] ?? feature}`,
    ),
    ...(change.status
      ? [change.status === "disabled" ? "disabled the account" : "re-enabled the account"]
      : []),
  ];
  return `${parts.join(", ")} for ${entry.target}`;
}

export function Admin({
  api,
  uid,
  navigate,
}: {
  api: Api;
  uid: string;
  navigate: (path: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [stories, setStories] = useState<AdminStory[] | null>(null);
  const [audit, setAudit] = useState<AdminAuditEntry[] | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = async (which: Tab) => {
    try {
      if (which === "overview")
        setOverview(await api<AdminOverview>("/admin/overview"));
      if (which === "users")
        setUsers((await api<{ items: AdminUser[] }>("/admin/users")).items);
      if (which === "stories")
        setStories((await api<{ items: AdminStory[] }>("/admin/stories")).items);
      if (which === "activity")
        setAudit((await api<{ items: AdminAuditEntry[] }>("/admin/audit")).items);
    } catch (error) {
      setNotice((error as Error).message);
    }
  };
  useEffect(() => {
    void load(tab);
  }, [tab]);

  const change = async (key: string, run: () => Promise<void>) => {
    setBusy(key);
    setNotice("");
    setConfirming(null);
    try {
      await run();
      setAudit(null);
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const updateUser = (user: AdminUser, body: { features?: Partial<Features>; status?: "active" | "disabled" }) =>
    change(`user-${user.uid}`, async () => {
      const result = await api<Pick<AdminUser, "uid" | "status" | "features">>(
        `/admin/users/${user.uid}`,
        { idempotencyKey: crypto.randomUUID(), ...body },
      );
      setUsers((current) =>
        current?.map((u) => (u.uid === result.uid ? { ...u, ...result } : u)) ?? null,
      );
      setOverview(null);
    });
  const setHidden = (story: AdminStory, hidden: boolean) =>
    change(`story-${story.id}`, async () => {
      await api(`/admin/stories/${story.id}`, {
        idempotencyKey: crypto.randomUUID(),
        hidden,
      });
      setStories((current) =>
        current?.map((s) => (s.id === story.id ? { ...s, hidden } : s)) ?? null,
      );
      setOverview(null);
    });

  const shown = (users ?? []).filter((u) =>
    `${u.email ?? ""} ${u.displayName} ${u.uid}`
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );

  return (
    <div className="hub admin">
      <div className="row-head">
        <div>
          <p className="eyebrow">Storybranch admin</p>
          <h1 className="admin-title">Admin</h1>
        </div>
      </div>
      <nav className="admin-tabs" aria-label="Admin sections">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? "nav-active" : ""}
            aria-current={tab === id ? "page" : undefined}
            onClick={() => {
              setNotice("");
              setTab(id);
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      {/* Reserved notice line: messages replace each other, never shift content. */}
      <p className="admin-notice" role="status">
        {notice}
      </p>

      {tab === "overview" &&
        (overview ? (
          <div className="admin-stats">
            {(
              [
                ["Users", overview.users],
                ["Admins", overview.admins],
                ["Disabled accounts", overview.disabledUsers],
                ["Published stories", overview.publishedStories],
                ["Hidden stories", overview.hiddenStories],
                ["Drafts", overview.drafts],
                ["Playthroughs", overview.playthroughs],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="panel admin-stat">
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        ) : (
          <div className="admin-placeholder" aria-hidden="true" />
        ))}

      {tab === "users" && (
        <section className="panel">
          <div className="row-head">
            <h2 className="panel-title">Users</h2>
            <input
              className="admin-search"
              type="search"
              placeholder="Search email, name or ID"
              aria-label="Search users"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {users ? (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Status</th>
                    <th>Last sign-in</th>
                    <th>Features</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {shown.map((user) => {
                    const self = user.uid === uid;
                    const key = `user-${user.uid}`;
                    const noProfile = user.status === "no-profile";
                    return (
                      <tr key={user.uid}>
                        <td>
                          <strong>{user.displayName}</strong>
                          <span className="admin-sub">{user.email ?? "No email"}</span>
                          <code className="admin-sub">{user.uid}</code>
                        </td>
                        <td>
                          <span className={`admin-badge admin-${user.status}`}>
                            {noProfile ? "Never opened the app" : user.status}
                          </span>
                        </td>
                        <td>{when(user.lastSignIn)}</td>
                        <td>
                          <div className="admin-flags">
                            {featureIds.map((feature) => {
                              const implied = feature !== "admin" && user.features.admin;
                              const on = user.features[feature] || implied;
                              const lockout = self && feature === "admin";
                              const confirmKey = `${key}-admin`;
                              return (
                                <label
                                  key={feature}
                                  className="admin-flag"
                                  title={
                                    implied
                                      ? "Included with admin"
                                      : lockout
                                        ? "You can't remove your own admin access"
                                        : undefined
                                  }
                                >
                                  <input
                                    type="checkbox"
                                    checked={on}
                                    disabled={noProfile || implied || lockout || busy === key}
                                    onChange={(e) => {
                                      // Removing admin takes a second click.
                                      if (feature === "admin" && !e.target.checked && confirming !== confirmKey) {
                                        setConfirming(confirmKey);
                                        setNotice(`Click Admin again to remove ${user.email ?? user.uid}'s admin access.`);
                                        return;
                                      }
                                      void updateUser(user, { features: { [feature]: e.target.checked } });
                                    }}
                                  />
                                  {featureLabels[feature]}
                                </label>
                              );
                            })}
                          </div>
                        </td>
                        <td>
                          {!noProfile && !self && (
                            <button
                              className="admin-action"
                              disabled={busy === key}
                              onClick={() => {
                                const next = user.status === "active" ? "disabled" : "active";
                                if (next === "disabled" && confirming !== `${key}-disable`) {
                                  setConfirming(`${key}-disable`);
                                  return;
                                }
                                void updateUser(user, { status: next });
                              }}
                            >
                              {user.status === "active"
                                ? confirming === `${key}-disable`
                                  ? "Confirm disable"
                                  : "Disable"
                                : "Enable"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!shown.length && <p className="admin-empty">No accounts match.</p>}
            </div>
          ) : (
            <div className="admin-placeholder" aria-hidden="true" />
          )}
        </section>
      )}

      {tab === "stories" && (
        <section className="panel">
          <h2 className="panel-title">Published stories</h2>
          {stories ? (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Story</th>
                    <th>Creator</th>
                    <th>Edition</th>
                    <th>Discover</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {stories.map((story) => (
                    <tr key={story.id}>
                      <td>
                        <button className="admin-link" onClick={() => navigate(`/s/${story.id}`)}>
                          {story.title}
                        </button>
                        <code className="admin-sub">{story.id}</code>
                      </td>
                      <td>{story.creatorEmail ?? (story.creatorUid ? story.creatorUid : "Storybranch")}</td>
                      <td>
                        <code>{story.publishedVersionId ?? "—"}</code>
                      </td>
                      <td>
                        <span className={`admin-badge ${story.hidden ? "admin-disabled" : "admin-active"}`}>
                          {story.hidden ? "Hidden" : "Listed"}
                        </span>
                      </td>
                      <td>
                        <button
                          className="admin-action"
                          disabled={busy === `story-${story.id}`}
                          onClick={() => void setHidden(story, !story.hidden)}
                        >
                          {story.hidden ? "Show in Discover" : "Hide from Discover"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="admin-empty">
                Hiding removes a story from Discover and stops new playthroughs; players who already started keep their saves.
              </p>
            </div>
          ) : (
            <div className="admin-placeholder" aria-hidden="true" />
          )}
        </section>
      )}

      {tab === "activity" && (
        <section className="panel">
          <h2 className="panel-title">Recent admin activity</h2>
          {audit ? (
            audit.length ? (
              <ul className="admin-audit">
                {audit.map((entry) => (
                  <li key={entry.id}>
                    <span>
                      <strong>{entry.actorEmail ?? entry.actorUid}</strong> {describe(entry)}
                    </span>
                    <time>{new Date(entry.at).toLocaleString()}</time>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="admin-empty">No admin changes yet.</p>
            )
          ) : (
            <div className="admin-placeholder" aria-hidden="true" />
          )}
        </section>
      )}
    </div>
  );
}
