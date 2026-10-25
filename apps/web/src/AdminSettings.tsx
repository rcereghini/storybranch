import { useEffect, useState } from "react";
import type { createApi } from "../../../packages/api-client/index";
import {
  appSettingsSchema,
  settingsChanges,
  type AdminSettings as AdminSettingsData,
  type AppSettings,
} from "../../../packages/contracts/settings";

type Api = ReturnType<typeof createApi>;

// Readable names for setting paths, shared with the activity log.
export const settingLabels: Record<string, string> = {
  "limits.aiRequestsPerDay": "AI requests per person per day",
  "limits.imagesPerDay": "Images per person per day",
  "limits.highQualityImageWeight": "High-quality image weight",
  "ai.copilot": "Copilot",
  "ai.writingHelp": "Studio writing help",
  "ai.imageGeneration": "Image generation",
  "newAccounts.publish": "New accounts can publish",
  "newAccounts.generate": "New accounts can generate images",
  "newAccounts.copilot": "New accounts get Copilot and writing help",
  "prices.images.draft": "Draft image price",
  "prices.images.high": "High-quality image price",
};
export const settingLabel = (path: string) =>
  settingLabels[path] ??
  path.replace(/^prices\.claude\.(.+)\.(\w+)$/, "$1 $2 price");
export const settingValue = (value: unknown) =>
  value === true
    ? "on"
    : value === false
      ? "off"
      : value === null
        ? "not set"
        : String(value);

const number = (text: string) => (text.trim() === "" ? NaN : Number(text));

export function AdminSettings({
  api,
  onNotice,
}: {
  api: Api;
  onNotice: (message: string) => void;
}) {
  const [data, setData] = useState<AdminSettingsData | null>(null);
  const [form, setForm] = useState<AppSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const load = async () => {
    const result = await api<AdminSettingsData>("/admin/settings");
    setData(result);
    setForm(result.settings);
  };
  useEffect(() => {
    let cancelled = false;
    api<AdminSettingsData>("/admin/settings")
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setForm(result.settings);
      })
      .catch((error) => {
        if (!cancelled) onNotice((error as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  if (!data || !form)
    return <div className="admin-placeholder" aria-hidden="true" />;

  const check = appSettingsSchema.safeParse(form);
  const problem = check.success
    ? ""
    : `${settingLabel(check.error.issues[0].path.join("."))}: ${check.error.issues[0].message}`;
  const changes = check.success ? settingsChanges(data.settings, form) : [];
  const update = (change: (f: AppSettings) => AppSettings) =>
    setForm((current) =>
      current ? change(structuredClone(current)) : current,
    );

  const save = async () => {
    setBusy(true);
    onNotice("");
    try {
      await api("/admin/settings/app", {
        idempotencyKey: crypto.randomUUID(),
        expectedRevision: data.revision,
        settings: form,
      });
      await load();
      onNotice("Settings saved. They apply within a minute.");
    } catch (error) {
      onNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggle = (
    label: string,
    hint: string,
    checked: boolean,
    set: (f: AppSettings, on: boolean) => void,
  ) => (
    <label className="settings-toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) =>
          update((f) => {
            set(f, e.target.checked);
            return f;
          })
        }
      />
      <span>
        <strong>{label}</strong>
        <small>{hint}</small>
      </span>
    </label>
  );

  return (
    <div className="admin-settings">
      <section className="panel">
        <div className="row-head">
          <h2 className="panel-title">Settings</h2>
          <span className="admin-sub">
            {data.updatedAt
              ? `Last changed ${new Date(data.updatedAt).toLocaleString()} by ${data.updatedBy ?? "an admin"}`
              : "Using the built-in defaults"}
          </span>
        </div>

        <fieldset className="settings-group">
          <legend>Daily limits</legend>
          <p className="admin-sub">
            Per person, reset at midnight UTC. Copilot messages and Studio
            writing help share the AI limit. 0 stops new requests.
          </p>
          <div className="settings-grid">
            <label className="email-field">
              AI requests per person per day
              <input
                type="number"
                min={0}
                max={10000}
                value={
                  Number.isNaN(form.limits.aiRequestsPerDay)
                    ? ""
                    : form.limits.aiRequestsPerDay
                }
                onChange={(e) =>
                  update((f) => {
                    f.limits.aiRequestsPerDay = number(e.target.value);
                    return f;
                  })
                }
              />
            </label>
            <label className="email-field">
              Images per person per day
              <input
                type="number"
                min={0}
                max={10000}
                value={
                  Number.isNaN(form.limits.imagesPerDay)
                    ? ""
                    : form.limits.imagesPerDay
                }
                onChange={(e) =>
                  update((f) => {
                    f.limits.imagesPerDay = number(e.target.value);
                    return f;
                  })
                }
              />
            </label>
            <label className="email-field">
              High-quality image weight
              <input
                type="number"
                min={1}
                max={20}
                value={
                  Number.isNaN(form.limits.highQualityImageWeight)
                    ? ""
                    : form.limits.highQualityImageWeight
                }
                onChange={(e) =>
                  update((f) => {
                    f.limits.highQualityImageWeight = number(e.target.value);
                    return f;
                  })
                }
              />
              <small>
                How much of the image allowance one high-quality image uses; a
                draft uses 1. Comics draw every panel in high quality.
              </small>
            </label>
          </div>
        </fieldset>

        <fieldset className="settings-group">
          <legend>AI features</legend>
          <p className="admin-sub">
            Turning one off hides it in the app and refuses its requests for
            everyone, admins included. Account flags still decide who gets it
            when it's on.
          </p>
          {toggle(
            "Copilot",
            "The chat assistant in the app shell.",
            form.ai.copilot,
            (f, on) => (f.ai.copilot = on),
          )}
          {toggle(
            "Studio writing help",
            "Write, rewrite, choices, image prompts and comic scripts in Studio.",
            form.ai.writingHelp,
            (f, on) => (f.ai.writingHelp = on),
          )}
          {toggle(
            "Image generation",
            "Generating images in Assets and comic panels. Uploads still work.",
            form.ai.imageGeneration,
            (f, on) => (f.ai.imageGeneration = on),
          )}
        </fieldset>

        <fieldset className="settings-group">
          <legend>New accounts</legend>
          <p className="admin-sub">
            What a new account can use from its first sign-in. Existing accounts
            keep their flags; change them in Users. Admin is never given by
            default.
          </p>
          {toggle(
            "Publish stories",
            "Publish to Discover and share StoryNodes.",
            form.newAccounts.publish,
            (f, on) => (f.newAccounts.publish = on),
          )}
          {toggle(
            "Generate images",
            "Paid image generation, within the daily limit.",
            form.newAccounts.generate,
            (f, on) => (f.newAccounts.generate = on),
          )}
          {toggle(
            "Copilot and writing help",
            "Paid AI chat and Studio writing help, within the daily limit.",
            form.newAccounts.copilot,
            (f, on) => (f.newAccounts.copilot = on),
          )}
        </fieldset>

        <fieldset className="settings-group">
          <legend>Prices for estimates</legend>
          <p className="admin-sub">
            Used only for the estimates in Usage &amp; spend; the real bill is
            in the Anthropic and OpenAI consoles. Claude prices are US dollars
            per million tokens; image prices are dollars per image. Leave an
            image price blank to count images without pricing them.
          </p>
          <div className="admin-table-wrap">
            <table className="admin-table settings-prices">
              <thead>
                <tr>
                  <th>Claude model</th>
                  <th>Input</th>
                  <th>Output</th>
                  <th>Cache read</th>
                  <th>Cache write</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(form.prices.claude).map(([model, price]) => (
                  <tr key={model}>
                    <td>
                      <code>{model}</code>
                    </td>
                    {(
                      ["input", "output", "cacheRead", "cacheWrite"] as const
                    ).map((field) => (
                      <td key={field}>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          aria-label={`${model} ${field} price`}
                          value={Number.isNaN(price[field]) ? "" : price[field]}
                          onChange={(e) =>
                            update((f) => {
                              f.prices.claude[model][field] = number(
                                e.target.value,
                              );
                              return f;
                            })
                          }
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="settings-grid">
            {(["draft", "high"] as const).map((tier) => (
              <label key={tier} className="email-field">
                {tier === "draft" ? "Draft image" : "High-quality image"} ($ per
                image)
                <input
                  type="number"
                  min={0}
                  step={0.001}
                  placeholder="Not priced"
                  value={form.prices.images[tier] ?? ""}
                  onChange={(e) =>
                    update((f) => {
                      f.prices.images[tier] =
                        e.target.value.trim() === ""
                          ? null
                          : Number(e.target.value);
                      return f;
                    })
                  }
                />
              </label>
            ))}
          </div>
        </fieldset>

        {/* Reserved line: the first problem, or what saving will change. */}
        <p
          className={`settings-summary${problem ? " email-problem" : ""}`}
          role="status"
        >
          {problem ||
            (changes.length
              ? `Saving changes: ${changes
                  .map(
                    (c) =>
                      `${settingLabel(c.path)} ${settingValue(c.before)} → ${settingValue(c.after)}`,
                  )
                  .join("; ")}.`
              : "No unsaved changes.")}
        </p>
        <div className="email-actions">
          <button
            className="primary"
            disabled={busy || !changes.length || !!problem}
            onClick={() => void save()}
          >
            {busy ? "Saving…" : "Save settings"}
          </button>
          <button
            className="admin-action"
            disabled={busy || !changes.length}
            onClick={() => setForm(data.settings)}
          >
            Revert
          </button>
          <button
            className="admin-action"
            disabled={busy || !settingsChanges(form, data.defaults).length}
            onClick={() => setForm(structuredClone(data.defaults))}
          >
            Restore defaults
          </button>
        </div>
      </section>
    </div>
  );
}
