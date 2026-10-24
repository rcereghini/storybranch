import { useEffect, useState } from "react";
import type { createApi } from "../../../packages/api-client/index";
import {
  adminAuditActions,
  type AdminAuditEntry,
  type AdminAuditPage,
} from "../../../packages/contracts/admin";

type Api = ReturnType<typeof createApi>;
type Action = (typeof adminAuditActions)[number];
const actionLabels: Record<Action, string> = {
  user: "Accounts",
  story: "Stories",
  email: "Emails",
  settings: "Settings",
};

export function AdminActivity({
  api,
  onNotice,
  describe,
}: {
  api: Api;
  onNotice: (message: string) => void;
  describe: (entry: AdminAuditEntry) => string;
}) {
  const [action, setAction] = useState<Action | "">("");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<AdminAuditEntry[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async (cursor: string | null) => {
    setBusy(true);
    try {
      const params = new URLSearchParams({
        q,
        ...(action ? { action } : {}),
        ...(cursor ? { cursor } : {}),
      });
      const page = await api<AdminAuditPage>(`/admin/audit?${params}`);
      setItems((current) =>
        cursor && current ? [...current, ...page.items] : page.items,
      );
      setNext(page.nextCursor);
    } catch (error) {
      onNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  // Typing waits a moment before searching.
  useEffect(() => {
    const timer = setTimeout(() => void load(null), q ? 250 : 0);
    return () => clearTimeout(timer);
  }, [action, q]);

  return (
    <section className="panel">
      <div className="row-head">
        <h2 className="panel-title">Admin activity</h2>
        <div className="admin-filters">
          <input
            className="admin-search"
            type="search"
            placeholder="Search admin, account or story"
            aria-label="Search activity"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            className="admin-search"
            aria-label="Type"
            value={action}
            onChange={(e) => setAction(e.target.value as Action | "")}
          >
            <option value="">All changes</option>
            {adminAuditActions.map((a) => (
              <option key={a} value={a}>
                {actionLabels[a]}
              </option>
            ))}
          </select>
        </div>
      </div>
      {items ? (
        items.length ? (
          <>
            <ul className="admin-audit">
              {items.map((entry) => (
                <li key={entry.id}>
                  <span>
                    <strong>{entry.actorEmail ?? entry.actorUid}</strong>{" "}
                    {describe(entry)}
                  </span>
                  <time>{new Date(entry.at).toLocaleString()}</time>
                </li>
              ))}
            </ul>
            {next && (
              <button
                className="admin-action"
                disabled={busy}
                onClick={() => void load(next)}
              >
                {busy ? "Loading…" : "Show older"}
              </button>
            )}
          </>
        ) : (
          <>
            <p className="admin-empty">No admin changes match.</p>
            {next && (
              <button
                className="admin-action"
                disabled={busy}
                onClick={() => void load(next)}
              >
                Search older changes
              </button>
            )}
          </>
        )
      ) : (
        <div className="admin-placeholder" aria-hidden="true" />
      )}
    </section>
  );
}
