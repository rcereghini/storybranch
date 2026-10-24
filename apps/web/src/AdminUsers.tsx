import { useEffect, useState } from "react";
import type { createApi } from "../../../packages/api-client/index";
import {
  adminUserSorts,
  adminUserStatuses,
  type AdminAuditEntry,
  type AdminUser,
  type AdminUserDetail,
  type AdminUsersPage,
} from "../../../packages/contracts/admin";
import { emailTemplates } from "../../../packages/contracts/email";
import {
  featureIds,
  type FeatureId,
  type Features,
} from "../../../packages/contracts/profile";
import type { AccountLimits } from "../../../packages/contracts/settings";
import { usd } from "./AdminUsage";

type Api = ReturnType<typeof createApi>;
type UserChange = {
  features?: Partial<Features>;
  status?: "active" | "disabled";
  limits?: AccountLimits;
  resetToday?: Array<"ai" | "images">;
};
export const featureLabels: Record<FeatureId, string> = {
  publish: "Publish",
  generate: "Generate",
  copilot: "Copilot",
  admin: "Admin",
};
const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString() : "—";
const statusLabels: Record<(typeof adminUserStatuses)[number], string> = {
  all: "All accounts",
  active: "Active",
  disabled: "Disabled",
  "no-profile": "Never opened the app",
};
const providerLabels: Record<string, string> = {
  password: "Email and password",
  "google.com": "Google",
};

// Feature switches and the disable/enable control, shared by the list and
// the detail view. Removing admin and disabling take a second click.
function Access({
  user,
  self,
  busy,
  change,
  onNotice,
}: {
  user: AdminUser;
  self: boolean;
  busy: boolean;
  change: (body: UserChange) => void;
  onNotice: (message: string) => void;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const noProfile = user.status === "no-profile";
  return (
    <div className="admin-access">
      <div className="admin-flags">
        {featureIds.map((feature) => {
          const implied = feature !== "admin" && user.features.admin;
          const lockout = self && feature === "admin";
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
                checked={user.features[feature] || implied}
                disabled={noProfile || implied || lockout || busy}
                onChange={(e) => {
                  if (
                    feature === "admin" &&
                    !e.target.checked &&
                    confirming !== "admin"
                  ) {
                    setConfirming("admin");
                    onNotice(
                      `Click Admin again to remove ${user.email ?? user.uid}'s admin access.`,
                    );
                    return;
                  }
                  setConfirming(null);
                  change({ features: { [feature]: e.target.checked } });
                }}
              />
              {featureLabels[feature]}
            </label>
          );
        })}
      </div>
      {!noProfile && !self && (
        <button
          className="admin-action"
          disabled={busy}
          onClick={() => {
            const next = user.status === "active" ? "disabled" : "active";
            if (next === "disabled" && confirming !== "disable") {
              setConfirming("disable");
              onNotice(
                `Disabling signs ${user.email ?? user.uid} out everywhere and blocks sign-in until you enable the account again.`,
              );
              return;
            }
            setConfirming(null);
            change({ status: next });
          }}
        >
          {user.status === "active"
            ? confirming === "disable"
              ? "Confirm disable"
              : "Disable"
            : "Enable"}
        </button>
      )}
    </div>
  );
}

export function AdminUsers({
  api,
  uid,
  onNotice,
  onChanged,
  describe,
}: {
  api: Api;
  uid: string;
  onNotice: (message: string) => void;
  onChanged: () => void;
  describe: (entry: AdminAuditEntry) => string;
}) {
  const [q, setQ] = useState("");
  const [status, setStatus] =
    useState<(typeof adminUserStatuses)[number]>("all");
  const [feature, setFeature] = useState<FeatureId | "">("");
  const [sort, setSort] =
    useState<(typeof adminUserSorts)[number]>("lastActive");
  const [page, setPage] = useState<AdminUsersPage | null>(null);
  const [items, setItems] = useState<AdminUser[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [limits, setLimits] = useState<AccountLimits | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async (cursor: number) => {
    const params = new URLSearchParams({
      q,
      status,
      cursor: String(cursor),
      ...(feature ? { feature } : {}),
      sort,
    });
    const result = await api<AdminUsersPage>(`/admin/users?${params}`);
    setPage(result);
    setItems((current) =>
      cursor && current ? [...current, ...result.items] : result.items,
    );
  };
  // Typing waits a moment before searching.
  useEffect(() => {
    const timer = setTimeout(
      () => void load(0).catch((e) => onNotice((e as Error).message)),
      q ? 250 : 0,
    );
    return () => clearTimeout(timer);
  }, [q, status, feature, sort]);

  const openDetail = async (target: string) => {
    setOpen(target);
    setDetail(null);
    try {
      const result = await api<AdminUserDetail>(`/admin/users/${target}`);
      setDetail(result);
      setLimits(result.limits.own);
    } catch (error) {
      onNotice((error as Error).message);
    }
  };
  const change = async (target: string, body: UserChange, done?: string) => {
    setBusy(target);
    onNotice("");
    try {
      const result = await api<Pick<AdminUser, "uid" | "status" | "features">>(
        `/admin/users/${target}`,
        {
          idempotencyKey: crypto.randomUUID(),
          ...body,
        },
      );
      setItems(
        (current) =>
          current?.map((u) =>
            u.uid === result.uid ? { ...u, ...result } : u,
          ) ?? null,
      );
      if (open === target) await openDetail(target);
      onChanged();
      if (done) onNotice(done);
    } catch (error) {
      onNotice((error as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (open) {
    const user = detail?.user;
    const limitField = (
      key: keyof AccountLimits,
      label: string,
      used: number,
      effective: number,
    ) => (
      <div className="email-field">
        <label htmlFor={`limit-${key}`}>{label}</label>
        <input
          id={`limit-${key}`}
          type="number"
          min={0}
          max={10000}
          placeholder={`Default (${detail?.limits.defaults[key]})`}
          value={limits?.[key] ?? ""}
          onChange={(e) =>
            setLimits((current) =>
              current
                ? {
                    ...current,
                    [key]:
                      e.target.value.trim() === ""
                        ? null
                        : Number(e.target.value),
                  }
                : current,
            )
          }
        />
        <small>
          Used today: {used} of {effective}
          {detail?.limits.own[key] === null ? " (default)" : " (own limit)"}
        </small>
      </div>
    );
    return (
      <section className="panel admin-user">
        <button className="admin-link" onClick={() => setOpen(null)}>
          ← All users
        </button>
        {detail && user ? (
          <>
            <div className="row-head">
              <div>
                <h2 className="panel-title">{user.displayName}</h2>
                <span className="admin-sub">{user.email ?? "No email"}</span>
              </div>
              <span className={`admin-badge admin-${user.status}`}>
                {user.status === "no-profile"
                  ? "Never opened the app"
                  : user.status}
              </span>
            </div>

            <dl className="admin-facts">
              <dt>Email</dt>
              <dd>
                {user.email ?? "—"}
                {user.email &&
                  (user.emailVerified ? " · confirmed" : " · not confirmed")}
              </dd>
              <dt>Signs in with</dt>
              <dd>
                {user.providers.map((p) => providerLabels[p] ?? p).join(", ") ||
                  "—"}
              </dd>
              <dt>Joined</dt>
              <dd>{when(user.createdAt)}</dd>
              <dt>Last sign-in</dt>
              <dd>{when(user.lastSignIn)}</dd>
              <dt>Last active</dt>
              <dd>{when(user.lastActive)}</dd>
              <dt>Account ID</dt>
              <dd>
                <code>{user.uid}</code>
              </dd>
              {user.signInBlocked && (
                <>
                  <dt>Sign-in</dt>
                  <dd>Blocked while disabled</dd>
                </>
              )}
            </dl>

            <h3 className="admin-subtitle">Access</h3>
            <Access
              user={user}
              self={user.uid === uid}
              busy={busy === user.uid}
              change={(body) => void change(user.uid, body)}
              onNotice={onNotice}
            />

            <h3 className="admin-subtitle">Daily limits</h3>
            <p className="admin-sub">
              Leave blank to use the default in Settings. 0 stops new requests.
            </p>
            <div className="settings-grid">
              {limitField(
                "aiRequestsPerDay",
                "AI requests per day",
                detail.limits.usedToday.ai,
                detail.limits.effective.aiRequestsPerDay,
              )}
              {limitField(
                "imagesPerDay",
                "Images per day",
                detail.limits.usedToday.images,
                detail.limits.effective.imagesPerDay,
              )}
            </div>
            <div className="email-actions">
              <button
                className="primary"
                disabled={
                  busy === user.uid ||
                  user.status === "no-profile" ||
                  JSON.stringify(limits) === JSON.stringify(detail.limits.own)
                }
                onClick={() =>
                  void change(user.uid, { limits: limits! }, "Limits saved.")
                }
              >
                Save limits
              </button>
              {(["ai", "images"] as const).map(
                (kind) =>
                  detail.limits.usedToday[kind] > 0 && (
                    <button
                      key={kind}
                      className="admin-action"
                      disabled={busy === user.uid}
                      onClick={() =>
                        void change(
                          user.uid,
                          { resetToday: [kind] },
                          `Today's ${kind === "ai" ? "AI" : "image"} usage reset.`,
                        )
                      }
                    >
                      Reset today's {kind === "ai" ? "AI requests" : "images"}
                    </button>
                  ),
              )}
            </div>

            <h3 className="admin-subtitle">Activity</h3>
            <div className="admin-stats">
              {(
                [
                  ["Published stories", detail.stories.length],
                  ["Drafts", detail.drafts.count],
                  ["Playthroughs", detail.playthroughs],
                  [
                    "AI requests, 30 days",
                    detail.usage30d.claudeRequests + detail.usage30d.images,
                  ],
                  [
                    "Estimated AI spend, 30 days",
                    usd(detail.usage30d.estimatedUsd),
                  ],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="panel admin-stat">
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
            {(detail.stories.length > 0 || detail.drafts.titles.length > 0) && (
              <ul className="admin-audit">
                {detail.stories.map((s) => (
                  <li key={s.id}>
                    <span>
                      <strong>{s.title}</strong> · published
                    </span>
                    {s.hidden && (
                      <span className="admin-badge admin-disabled">Hidden</span>
                    )}
                  </li>
                ))}
                {detail.drafts.titles.map((title, i) => (
                  <li key={`draft-${i}`}>
                    <span>{title} · draft</span>
                  </li>
                ))}
              </ul>
            )}

            <h3 className="admin-subtitle">Recent emails</h3>
            {detail.emails.length ? (
              <ul className="admin-audit">
                {detail.emails.map((e) => (
                  <li key={e.id}>
                    <span>
                      {emailTemplates[e.template]?.label ?? e.template}
                      {e.test ? " (test)" : ""} ·{" "}
                      <span
                        className={`admin-badge ${e.status === "sent" ? "admin-active" : e.status === "failed" ? "admin-disabled" : "admin-no-profile"}`}
                      >
                        {e.status}
                      </span>
                    </span>
                    <time>{new Date(e.at).toLocaleString()}</time>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="admin-empty">No emails in the last 90 days.</p>
            )}

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
              <p className="admin-empty">No admin changes to this account.</p>
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
      <div className="row-head">
        <h2 className="panel-title">Users</h2>
        <div className="admin-filters">
          <input
            className="admin-search"
            type="search"
            placeholder="Search email, name or ID"
            aria-label="Search users"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            className="admin-search"
            aria-label="Status"
            value={status}
            onChange={(e) =>
              setStatus(e.target.value as (typeof adminUserStatuses)[number])
            }
          >
            {adminUserStatuses.map((s) => (
              <option key={s} value={s}>
                {statusLabels[s]}
              </option>
            ))}
          </select>
          <select
            className="admin-search"
            aria-label="Feature"
            value={feature}
            onChange={(e) => setFeature(e.target.value as FeatureId | "")}
          >
            <option value="">Any access</option>
            {featureIds.map((f) => (
              <option key={f} value={f}>
                Has {featureLabels[f]}
              </option>
            ))}
          </select>
          <select
            className="admin-search"
            aria-label="Sort"
            value={sort}
            onChange={(e) =>
              setSort(e.target.value as (typeof adminUserSorts)[number])
            }
          >
            <option value="lastActive">Recently active</option>
            <option value="lastSignIn">Recently signed in</option>
            <option value="newest">Newest accounts</option>
          </select>
        </div>
      </div>
      {items && page ? (
        <div className="admin-table-wrap">
          <p className="admin-sub" role="status">
            {page.total === 1 ? "1 account" : `${page.total} accounts`}
            {page.scanned >= 10000
              ? " (searching the first 10,000 sign-ups)"
              : ""}
          </p>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Account</th>
                <th>Status</th>
                <th>Last active</th>
                <th>Access</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((user) => (
                <tr key={user.uid}>
                  <td>
                    <button
                      className="admin-link"
                      onClick={() => void openDetail(user.uid)}
                    >
                      {user.displayName}
                    </button>
                    <span className="admin-sub">
                      {user.email ?? "No email"}
                    </span>
                    <code className="admin-sub">{user.uid}</code>
                  </td>
                  <td>
                    <span className={`admin-badge admin-${user.status}`}>
                      {user.status === "no-profile"
                        ? "Never opened the app"
                        : user.status}
                    </span>
                  </td>
                  <td>{when(user.lastActive)}</td>
                  <td colSpan={2}>
                    <Access
                      user={user}
                      self={user.uid === uid}
                      busy={busy === user.uid}
                      change={(body) => void change(user.uid, body)}
                      onNotice={onNotice}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!items.length && <p className="admin-empty">No accounts match.</p>}
          {page.nextCursor !== null && (
            <button
              className="admin-action"
              onClick={() =>
                void load(page.nextCursor!).catch((e) =>
                  onNotice((e as Error).message),
                )
              }
            >
              Show more
            </button>
          )}
        </div>
      ) : (
        <div className="admin-placeholder" aria-hidden="true" />
      )}
    </section>
  );
}
