import { useEffect, useMemo, useState } from "react";
import type { createApi } from "../../../packages/api-client/index";
import {
  emailContentSchema,
  emailTemplates,
  sampleEmailLink,
  type AdminEmails as AdminEmailsData,
  type AdminEmailTemplate,
  type EmailContent,
  type EmailLogEntry,
  type EmailTemplateId,
} from "../../../packages/contracts/email";
import { renderEmail } from "../../../packages/email/render";

type Api = ReturnType<typeof createApi>;
const key = () => crypto.randomUUID();
const same = (a: EmailContent, b: EmailContent) =>
  JSON.stringify(a) === JSON.stringify(b);
const fieldNames: Record<string, string> = {
  subject: "Subject",
  preheader: "Preview text",
  heading: "Heading",
  paragraphs: "Paragraph",
  buttonLabel: "Button label",
  footnote: "Small print",
};

export function AdminEmails({
  api,
  onNotice,
}: {
  api: Api;
  onNotice: (message: string) => void;
}) {
  const [data, setData] = useState<AdminEmailsData | null>(null);
  const [log, setLog] = useState<EmailLogEntry[] | null>(null);
  const [selected, setSelected] = useState<EmailTemplateId>("verify-email");
  const [edit, setEdit] = useState<EmailContent | null>(null);
  const [beforeAi, setBeforeAi] = useState<EmailContent | null>(null);
  const [instruction, setInstruction] = useState("");
  const [width, setWidth] = useState<"desktop" | "phone">("desktop");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const load = async () => {
    const [emails, entries] = await Promise.all([
      api<AdminEmailsData>("/admin/emails"),
      api<{ items: EmailLogEntry[] }>("/admin/email-log"),
    ]);
    setData(emails);
    setLog(entries.items);
    return emails;
  };
  useEffect(() => {
    load().catch((error) => onNotice((error as Error).message));
  }, []);

  const template = data?.templates.find((t) => t.id === selected) ?? null;
  // What the editor starts from: the draft, else what is sent today.
  const saved = template
    ? (template.draft ?? template.published.content)
    : null;
  useEffect(() => {
    setEdit(saved);
    setBeforeAi(null);
    setConfirming(null);
  }, [selected, template?.revision, !!data]);

  const check = edit ? emailContentSchema.safeParse(edit) : null;
  const problem =
    check && !check.success
      ? `${fieldNames[String(check.error.issues[0].path[0])] ?? "Email"}: ${check.error.issues[0].message}`
      : "";
  const dirty = !!(edit && saved && !same(edit, saved));
  const preview = useMemo(() => {
    if (!edit || !check?.success) return null;
    try {
      return renderEmail({
        content: edit,
        name: "Robin",
        link: sampleEmailLink(location.origin, selected),
        siteUrl: location.origin,
      });
    } catch {
      return null;
    }
  }, [edit, selected, check?.success]);

  const act = async (
    name: string,
    run: () => Promise<string | void>,
    reload = true,
  ) => {
    setBusy(name);
    onNotice("");
    setConfirming(null);
    try {
      const message = await run();
      if (reload) await load();
      if (message) onNotice(message);
    } catch (error) {
      onNotice((error as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const command = (body: object) =>
    api(`/admin/emails/${selected}`, { idempotencyKey: key(), ...body });
  const revision = template?.revision ?? 0;
  const set = (patch: Partial<EmailContent>) =>
    setEdit((current) => (current ? { ...current, ...patch } : current));

  if (!data || !template || !edit)
    return <div className="admin-placeholder" aria-hidden="true" />;
  const status = (t: AdminEmailTemplate) =>
    t.draft
      ? "Unpublished changes"
      : t.published.version
        ? `Version ${t.published.version}`
        : "Default";

  return (
    <div className="admin-emails">
      <section className="panel">
        <div className="row-head">
          <h2 className="panel-title">System emails</h2>
          <span className="admin-sub">
            {data.senderConfigured
              ? "Sending through SendGrid"
              : "Not sending: SendGrid isn't configured here"}
          </span>
        </div>
        <div className="email-list" role="tablist" aria-label="Emails">
          {data.templates.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={t.id === selected}
              onClick={() => {
                if (dirty && t.id !== selected && confirming !== "leave") {
                  setConfirming("leave");
                  onNotice(
                    "You have unsaved changes. Click again to discard them.",
                  );
                  return;
                }
                onNotice("");
                setSelected(t.id);
              }}
            >
              <strong>{t.label}</strong>
              <span>{t.sentWhen}</span>
              <span
                className={`admin-badge ${t.draft ? "admin-no-profile" : "admin-active"}`}
              >
                {status(t)}
              </span>
            </button>
          ))}
        </div>
      </section>

      <div className="email-workspace">
        <section
          className="panel email-editor"
          aria-label={`Edit ${template.label}`}
        >
          <h2 className="panel-title">{template.label}</h2>
          <p className="admin-sub">
            Sent when: {template.sentWhen} The button: {template.link} Use{" "}
            <code>{"{{name}}"}</code> for the reader's name.
          </p>
          <label className="email-field">
            Subject
            <input
              value={edit.subject}
              maxLength={120}
              onChange={(e) => set({ subject: e.target.value })}
            />
          </label>
          <label className="email-field">
            Preview text <small>shown after the subject in inboxes</small>
            <input
              value={edit.preheader}
              maxLength={140}
              onChange={(e) => set({ preheader: e.target.value })}
            />
          </label>
          <label className="email-field">
            Heading
            <input
              value={edit.heading}
              maxLength={120}
              onChange={(e) => set({ heading: e.target.value })}
            />
          </label>
          {edit.paragraphs.map((paragraph, i) => (
            <div key={i} className="email-field">
              <label htmlFor={`email-p-${i}`}>Paragraph {i + 1}</label>
              <textarea
                id={`email-p-${i}`}
                rows={3}
                value={paragraph}
                maxLength={600}
                onChange={(e) =>
                  set({
                    paragraphs: edit.paragraphs.map((p, j) =>
                      j === i ? e.target.value : p,
                    ),
                  })
                }
              />
              {edit.paragraphs.length > 1 && (
                <button
                  className="admin-link"
                  onClick={() =>
                    set({
                      paragraphs: edit.paragraphs.filter((_, j) => j !== i),
                    })
                  }
                >
                  Remove paragraph {i + 1}
                </button>
              )}
            </div>
          ))}
          {edit.paragraphs.length < 6 && (
            <button
              className="admin-action"
              onClick={() => set({ paragraphs: [...edit.paragraphs, ""] })}
            >
              Add paragraph
            </button>
          )}
          <label className="email-field">
            Button label
            <input
              value={edit.buttonLabel}
              maxLength={40}
              onChange={(e) => set({ buttonLabel: e.target.value })}
            />
          </label>
          <label className="email-field">
            Small print
            <textarea
              rows={2}
              value={edit.footnote}
              maxLength={300}
              onChange={(e) => set({ footnote: e.target.value })}
            />
          </label>
          {/* Reserved line: the first problem, replaced in place. */}
          <p className="email-problem" role="status">
            {problem}
          </p>

          <div className="email-ai">
            <label className="email-field">
              Rewrite with AI
              <textarea
                rows={2}
                maxLength={500}
                placeholder="For example: make it warmer and shorter"
                value={instruction}
                disabled={!data.aiAvailable}
                onChange={(e) => setInstruction(e.target.value)}
              />
            </label>
            <div className="email-actions">
              <button
                className="admin-action"
                disabled={
                  !data.aiAvailable ||
                  !!busy ||
                  instruction.trim().length < 3 ||
                  !check?.success
                }
                onClick={() =>
                  void act(
                    "rewrite",
                    async () => {
                      const result = await command({
                        action: "rewrite",
                        content: edit,
                        instruction,
                      });
                      setBeforeAi(edit);
                      setEdit((result as { content: EmailContent }).content);
                      return "AI suggestion applied. Review it, then save or undo.";
                    },
                    false,
                  )
                }
              >
                {busy === "rewrite" ? "Rewriting…" : "Rewrite"}
              </button>
              {beforeAi && (
                <button
                  className="admin-action"
                  onClick={() => {
                    setEdit(beforeAi);
                    setBeforeAi(null);
                    onNotice("");
                  }}
                >
                  Undo AI changes
                </button>
              )}
            </div>
            {!data.aiAvailable && (
              <p className="admin-sub">AI writing help isn't connected here.</p>
            )}
          </div>

          <div className="email-actions">
            <button
              className="primary"
              disabled={!dirty || !check?.success || !!busy}
              onClick={() =>
                void act("save", async () => {
                  await command({
                    action: "save",
                    expectedRevision: revision,
                    content: edit,
                  });
                  return "Draft saved. Publish it to start sending it.";
                })
              }
            >
              {busy === "save" ? "Saving…" : "Save draft"}
            </button>
            <button
              className="admin-action"
              disabled={!template.draft || dirty || !!busy}
              onClick={() => {
                if (confirming !== "publish") {
                  setConfirming("publish");
                  onNotice(
                    `Click Publish again to send this version of “${template.label}” from now on.`,
                  );
                  return;
                }
                void act("publish", async () => {
                  const result = (await command({
                    action: "publish",
                    expectedRevision: revision,
                  })) as { version: number };
                  return `Published version ${result.version}.`;
                });
              }}
            >
              {confirming === "publish" ? "Confirm publish" : "Publish"}
            </button>
            <button
              className="admin-action"
              disabled={!check?.success || !!busy}
              onClick={() =>
                void act("test", async () => {
                  const result = (await command({
                    action: "test",
                    content: edit,
                  })) as { status: string; to: string };
                  return result.status === "sent"
                    ? `Test sent to ${result.to}.`
                    : result.status === "skipped"
                      ? "Test recorded but not sent: SendGrid isn't configured here."
                      : "The test email failed. See the email log.";
                })
              }
            >
              {busy === "test" ? "Sending…" : "Send test to me"}
            </button>
            {dirty && (
              <button
                className="admin-action"
                onClick={() => {
                  setEdit(saved);
                  setBeforeAi(null);
                }}
              >
                Revert unsaved changes
              </button>
            )}
            {template.draft && !dirty && (
              <button
                className="admin-action"
                disabled={!!busy}
                onClick={() =>
                  void act("discard", async () => {
                    await command({
                      action: "discard",
                      expectedRevision: revision,
                    });
                    return "Draft discarded.";
                  })
                }
              >
                Discard draft
              </button>
            )}
          </div>
        </section>

        <section className="panel email-preview" aria-label="Preview">
          <div className="row-head">
            <h2 className="panel-title">Preview</h2>
            <div className="segmented" role="group" aria-label="Preview width">
              {(["desktop", "phone"] as const).map((w) => (
                <button
                  key={w}
                  aria-pressed={width === w}
                  onClick={() => setWidth(w)}
                >
                  {w === "desktop" ? "Desktop" : "Phone"}
                </button>
              ))}
            </div>
          </div>
          <p className="admin-sub">
            Subject: <strong>{preview?.subject ?? "—"}</strong>
          </p>
          <div className={`email-frame email-frame-${width}`}>
            {preview ? (
              <iframe
                title={`${template.label} preview`}
                sandbox=""
                srcDoc={preview.html}
              />
            ) : (
              <p className="admin-empty">
                Fix the highlighted problem to see the preview.
              </p>
            )}
          </div>
        </section>
      </div>

      <section className="panel">
        <h2 className="panel-title">History</h2>
        <ul className="admin-audit">
          {template.versions.map((v) => (
            <li key={v.version}>
              <span>
                <strong>Version {v.version}</strong>
                {v.version === template.published.version
                  ? " · being sent"
                  : ""}{" "}
                · {v.publishedBy ?? "unknown"}
              </span>
              <span className="email-history-actions">
                <time>{new Date(v.publishedAt).toLocaleString()}</time>
                <button
                  className="admin-action"
                  disabled={!!busy}
                  onClick={() =>
                    void act("restore", async () => {
                      await command({
                        action: "restore",
                        expectedRevision: revision,
                        version: v.version,
                      });
                      return `Version ${v.version} copied into the draft.`;
                    })
                  }
                >
                  Restore to draft
                </button>
              </span>
            </li>
          ))}
          <li>
            <span>
              <strong>Built-in default</strong>
              {template.published.version === 0 ? " · being sent" : ""}
            </span>
            <span className="email-history-actions">
              <button
                className="admin-action"
                disabled={!!busy}
                onClick={() =>
                  void act("restore", async () => {
                    await command({
                      action: "restore",
                      expectedRevision: revision,
                      version: 0,
                    });
                    return "The built-in default was copied into the draft.";
                  })
                }
              >
                Restore to draft
              </button>
            </span>
          </li>
        </ul>
      </section>

      <section className="panel">
        <h2 className="panel-title">Email log</h2>
        {log && log.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Sent</th>
                  <th>Email</th>
                  <th>To</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {log.map((entry) => (
                  <tr key={entry.id}>
                    <td>{new Date(entry.at).toLocaleString()}</td>
                    <td>
                      {emailTemplates[entry.template]?.label ?? entry.template}
                      <span className="admin-sub">
                        {entry.test
                          ? "Test"
                          : entry.version
                            ? `Version ${entry.version}`
                            : "Default"}
                      </span>
                    </td>
                    <td>{entry.to}</td>
                    <td>
                      <span
                        className={`admin-badge ${entry.status === "sent" ? "admin-active" : entry.status === "failed" ? "admin-disabled" : "admin-no-profile"}`}
                      >
                        {entry.status}
                      </span>
                      {entry.detail && (
                        <span className="admin-sub">{entry.detail}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="admin-empty">No emails in the last 90 days.</p>
        )}
      </section>
    </div>
  );
}
