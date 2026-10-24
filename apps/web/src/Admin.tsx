import { useEffect, useState } from "react";
import type { createApi } from "../../../packages/api-client/index";
import type {
  AdminAuditEntry,
  AdminOverview,
} from "../../../packages/contracts/admin";
import type { FeatureId, Features } from "../../../packages/contracts/profile";
import type { AccountLimits } from "../../../packages/contracts/settings";
import { AdminUsers, featureLabels } from "./AdminUsers";
import { AdminUsage, usd } from "./AdminUsage";
import { AdminAnalytics } from "./AdminAnalytics";
import { AdminEmails } from "./AdminEmails";
import { AdminSettings, settingLabel, settingValue } from "./AdminSettings";
import { AdminStories } from "./AdminStories";
import { AdminActivity } from "./AdminActivity";
import { emailTemplates, type EmailTemplateId } from "../../../packages/contracts/email";
import "./admin.css";

type Api = ReturnType<typeof createApi>;
type Tab =
  | "overview"
  | "usage"
  | "analytics"
  | "users"
  | "stories"
  | "emails"
  | "settings"
  | "activity";
const tabs: Array<[Tab, string]> = [
  ["overview", "Overview"],
  ["usage", "Usage & spend"],
  ["analytics", "Analytics"],
  ["users", "Users"],
  ["stories", "Stories"],
  ["emails", "Emails"],
  ["settings", "Settings"],
  ["activity", "Activity"],
];
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
      .map((c) => `${settingLabel(c.path)} ${settingValue(c.before)} → ${settingValue(c.after)}`)
      .join("; ")}`;
  }
  if (entry.action === "email") {
    const email = change as { action?: string; version?: number; status?: string };
    const label = emailTemplates[entry.target as EmailTemplateId]?.label ?? entry.target;
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
      ? [change.status === "disabled" ? "disabled the account" : "re-enabled the account"]
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
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (tab === "overview")
      api<AdminOverview>("/admin/overview")
        .then(setOverview)
        .catch((error) => setNotice((error as Error).message));
  }, [tab]);

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
                ["AI requests, 30 days", overview.aiRequests30d],
                ["Estimated AI spend, 30 days", usd(overview.aiEstimatedUsd30d)],
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

      {tab === "usage" && <AdminUsage api={api} onError={setNotice} />}

      {tab === "analytics" && <AdminAnalytics api={api} onError={setNotice} />}

      {tab === "users" && (
        <AdminUsers
          api={api}
          uid={uid}
          onNotice={setNotice}
          onChanged={() => setOverview(null)}
          describe={describe}
        />
      )}

      {tab === "stories" && (
        <AdminStories
          api={api}
          navigate={navigate}
          onNotice={setNotice}
          onChanged={() => setOverview(null)}
          describe={describe}
        />
      )}

      {tab === "emails" && <AdminEmails api={api} onNotice={setNotice} />}

      {tab === "settings" && <AdminSettings api={api} onNotice={setNotice} />}

      {tab === "activity" && (
        <AdminActivity api={api} onNotice={setNotice} describe={describe} />
      )}
    </div>
  );
}
