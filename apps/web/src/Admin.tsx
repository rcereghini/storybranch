import { useCallback, useEffect, useState, type MouseEvent } from "react";
import type { createApi } from "../../../packages/api-client/index";
import type {
  AdminAuditEntry,
  AdminOverview as Totals,
} from "../../../packages/contracts/admin";
import type { FeatureId, Features } from "../../../packages/contracts/profile";
import type { AccountLimits } from "../../../packages/contracts/settings";
import { AdminUsers, featureLabels } from "./AdminUsers";
import { AdminUsage } from "./AdminUsage";
import { AdminOverview } from "./AdminOverview";
import { AdminAnalytics } from "./AdminAnalytics";
import { AdminEmails } from "./AdminEmails";
import { AdminSettings, settingLabel, settingValue } from "./AdminSettings";
import { AdminStories } from "./AdminStories";
import { AdminActivity } from "./AdminActivity";
import {
  emailTemplates,
  type EmailTemplateId,
} from "../../../packages/contracts/email";
import { Logo } from "./icons";
import "./admin.css";

type Api = ReturnType<typeof createApi>;
export type AdminSection =
  | "overview"
  | "usage"
  | "analytics"
  | "users"
  | "stories"
  | "emails"
  | "settings"
  | "activity";
// Sidebar icons: 24px stroke paths.
const icons: Record<AdminSection, string[]> = {
  overview: ["M3 3h7v9H3z", "M14 3h7v5h-7z", "M14 12h7v9h-7z", "M3 16h7v5H3z"],
  users: [
    "M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z",
    "M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5",
    "M17 11.5a2.5 2.5 0 1 0 0-5",
    "M17 14c2.4 0 4 1.5 4.5 4",
  ],
  stories: [
    "M5 4h10a4 4 0 0 1 4 4v12H9a4 4 0 0 1-4-4z",
    "M9 20a4 4 0 0 1 0-8h10",
  ],
  emails: ["M3 5h18v14H3z", "m3.5 6.5 8.5 6.5 8.5-6.5"],
  usage: [
    "M12 3v18",
    "M16.5 7.5c0-1.7-2-3-4.5-3s-4.5 1.3-4.5 3 2 2.6 4.5 3 4.5 1.3 4.5 3-2 3-4.5 3-4.5-1.3-4.5-3",
  ],
  analytics: ["M4 20V10", "M10 20V4", "M16 20v-7", "M22 20H2"],
  settings: [
    "M4 7h10",
    "M18 7h2",
    "M16 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
    "M4 17h4",
    "M12 17h8",
    "M10 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  ],
  activity: ["M3 12h4l3-8 4 16 3-8h4"],
};
const groups: Array<{
  label: string | null;
  items: Array<[AdminSection, string]>;
}> = [
  { label: null, items: [["overview", "Overview"]] },
  { label: "People", items: [["users", "Users"]] },
  {
    label: "Content",
    items: [
      ["stories", "Stories"],
      ["emails", "Emails"],
    ],
  },
  {
    label: "Business",
    items: [
      ["usage", "Usage & spend"],
      ["analytics", "Analytics"],
    ],
  },
  {
    label: "System",
    items: [
      ["settings", "Settings"],
      ["activity", "Activity"],
    ],
  },
];
const titles = Object.fromEntries(groups.flatMap((g) => g.items)) as Record<
  AdminSection,
  string
>;

// Every view has its own address: /admin, /admin/users, /admin/users/{uid}.
export const adminPath = (section: AdminSection, id?: string | null) =>
  section === "overview"
    ? "/admin"
    : `/admin/${section}${id ? `/${encodeURIComponent(id)}` : ""}`;
function route(path: string): {
  section: AdminSection | null;
  id: string | null;
} {
  const [, , section, id] = path.split("/");
  if (!section) return { section: "overview", id: null };
  return section in titles && section !== "overview"
    ? {
        section: section as AdminSection,
        id: id ? decodeURIComponent(id) : null,
      }
    : { section: null, id: null };
}
// Which deployment this is, so nobody mistakes production for a preview.
function environment() {
  const host = location.hostname;
  if (host === "localhost" || host === "127.0.0.1")
    return { label: "Local", tone: "local" };
  if (host.endsWith(".vercel.app"))
    return { label: "Preview", tone: "preview" };
  return { label: "Production", tone: "production" };
}

function describe(entry: AdminAuditEntry) {
  const change = entry.change as {
    features?: Partial<Features>;
    status?: string;
    hidden?: boolean;
    limits?: AccountLimits;
    resetToday?: Array<"ai" | "images">;
  };
  if (entry.action === "settings") {
    const { changes = [] } = entry.change as {
      changes?: Array<{ path: string; before: unknown; after: unknown }>;
    };
    return `changed settings: ${changes
      .map(
        (c) =>
          `${settingLabel(c.path)} ${settingValue(c.before)} → ${settingValue(c.after)}`,
      )
      .join("; ")}`;
  }
  if (entry.action === "email") {
    const email = change as {
      action?: string;
      version?: number;
      status?: string;
    };
    const label =
      emailTemplates[entry.target as EmailTemplateId]?.label ?? entry.target;
    return email.action === "publish"
      ? `published version ${email.version} of the ${label} email`
      : email.action === "restore"
        ? `restored ${email.version ? `version ${email.version}` : "the default"} into the ${label} draft`
        : email.action === "discard"
          ? `discarded the ${label} draft`
          : email.action === "test"
            ? `sent a test of the ${label} email (${email.status})`
            : `saved a draft of the ${label} email`;
  }
  if (entry.action === "story")
    return `${change.hidden ? "hid" : "showed"} story ${entry.target} ${change.hidden ? "from" : "in"} Discover`;
  const parts = [
    ...Object.entries(change.features ?? {}).map(
      ([feature, on]) =>
        `${on ? "turned on" : "turned off"} ${featureLabels[feature as FeatureId] ?? feature}`,
    ),
    ...(change.status
      ? [
          change.status === "disabled"
            ? "disabled the account"
            : "re-enabled the account",
        ]
      : []),
    ...(change.limits
      ? [
          `set daily limits to ${change.limits.aiRequestsPerDay ?? "default"} AI requests and ${change.limits.imagesPerDay ?? "default"} images`,
        ]
      : []),
    ...(change.resetToday ?? []).map(
      (kind) => `reset today's ${kind === "ai" ? "AI requests" : "images"}`,
    ),
  ];
  return `${parts.join(", ")} for ${entry.target}`;
}

// The admin workspace: its own full-window frame (not the player app's
// header and footer), dark in both themes, with a sidebar of sections.
export function Admin({
  api,
  uid,
  email,
  path,
  navigate,
}: {
  api: Api;
  uid: string;
  email: string | null;
  path: string;
  navigate: (path: string) => void;
}) {
  const { section, id } = route(path);
  const [overview, setOverview] = useState<Totals | null>(null);
  // Notifications float over the page and clear themselves, so nothing shifts.
  const [toasts, setToasts] = useState<Array<{ id: number; message: string }>>(
    [],
  );
  const notify = useCallback((message: string) => {
    if (!message) return;
    const key = Date.now() + Math.random();
    setToasts((current) => [...current.slice(-2), { id: key, message }]);
    setTimeout(
      () => setToasts((current) => current.filter((t) => t.id !== key)),
      6000,
    );
  }, []);
  useEffect(() => {
    if (section === "overview")
      api<Totals>("/admin/overview")
        .then(setOverview)
        .catch((error) => notify((error as Error).message));
  }, [section]);
  // Real links (they open in a new tab when asked), routed in place otherwise.
  const link = (to: string) => ({
    href: to,
    onClick: (event: MouseEvent<HTMLAnchorElement>) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button)
        return;
      event.preventDefault();
      navigate(to);
    },
  });
  const env = environment();
  const initials = (email ?? "?").slice(0, 2).toUpperCase();

  return (
    <div className="admin-app theme-dark">
      <nav className="admin-side" aria-label="Admin sections">
        <a className="admin-brand" {...link("/admin")}>
          <Logo size={26} />
          <span>
            <strong>storybranch</strong>
            <small>Control</small>
          </span>
        </a>
        {groups.map((group) => (
          <div key={group.label ?? "top"} className="admin-side-group">
            {group.label && (
              <span className="admin-side-label">{group.label}</span>
            )}
            {group.items.map(([key, label]) => (
              <a
                key={key}
                className="admin-side-item"
                aria-current={section === key ? "page" : undefined}
                {...link(adminPath(key))}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  {icons[key].map((d) => (
                    <path key={d} d={d} />
                  ))}
                </svg>
                {label}
              </a>
            ))}
          </div>
        ))}
        <a className="admin-side-item admin-back" {...link("/")}>
          ← Back to the app
        </a>
      </nav>

      <div className="admin-body">
        <header className="admin-top">
          <h1>{section ? titles[section] : "Not found"}</h1>
          <div className="admin-top-end">
            <span className={`admin-env admin-env-${env.tone}`}>
              {env.label}
            </span>
            <span
              className="admin-me"
              title={email ?? undefined}
              aria-label={`Signed in as ${email ?? "an admin"}`}
            >
              {initials}
            </span>
          </div>
        </header>

        <main className="hub admin admin-main">
          {section === null && (
            <section className="panel">
              <h2 className="panel-title">There's no admin page here</h2>
              <p className="admin-empty">
                <a {...link("/admin")}>Go to the overview</a>
              </p>
            </section>
          )}

          {section === "overview" && (
            <AdminOverview
              api={api}
              totals={overview}
              navigate={navigate}
              onError={notify}
              describe={describe}
            />
          )}

          {section === "usage" && <AdminUsage api={api} onError={notify} />}

          {section === "analytics" && (
            <AdminAnalytics api={api} onError={notify} />
          )}

          {section === "users" && (
            <AdminUsers
              api={api}
              uid={uid}
              open={id}
              onOpen={(next) => navigate(adminPath("users", next))}
              onNotice={notify}
              onChanged={() => setOverview(null)}
              describe={describe}
            />
          )}

          {section === "stories" && (
            <AdminStories
              api={api}
              open={id}
              onOpen={(next) => navigate(adminPath("stories", next))}
              navigate={navigate}
              onNotice={notify}
              onChanged={() => setOverview(null)}
              describe={describe}
            />
          )}

          {section === "emails" && <AdminEmails api={api} onNotice={notify} />}

          {section === "settings" && (
            <AdminSettings api={api} onNotice={notify} />
          )}

          {section === "activity" && (
            <AdminActivity api={api} onNotice={notify} describe={describe} />
          )}
        </main>
      </div>

      <div className="admin-toasts" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className="admin-toast" role="status">
            <span>{toast.message}</span>
            <button
              aria-label="Dismiss"
              onClick={() =>
                setToasts((current) => current.filter((t) => t.id !== toast.id))
              }
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
