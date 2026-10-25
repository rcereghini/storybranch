import { useEffect, useState, type MouseEvent } from "react";
import type { createApi } from "../../../packages/api-client/index";
import type {
  AdminAuditEntry,
  AdminOverview as Totals,
} from "../../../packages/contracts/admin";
import {
  commandDays,
  type CommandCenter,
  type CommandMetric,
} from "../../../packages/contracts/command";
import { usd } from "./AdminUsage";

type Api = ReturnType<typeof createApi>;
type Days = (typeof commandDays)[number];

// One series as a line, scaled to its own range; decoration only, since the
// tile states the numbers.
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const points = values
    .map(
      (v, i) =>
        `${((i / (values.length - 1)) * 100).toFixed(1)},${(26 - ((v - min) / (max - min || 1)) * 22).toFixed(1)}`,
    )
    .join(" ");
  return (
    <svg
      className="cc-spark"
      viewBox="0 0 100 30"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polyline points={points} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// Change against the period before. Spend and requests going up isn't good
// or bad in itself, so those stay neutral.
function Delta({
  metric,
  neutral = false,
}: {
  metric: CommandMetric;
  neutral?: boolean;
}) {
  if (metric.previous === null) return null;
  if (metric.previous === 0)
    return metric.value ? (
      <span className="cc-delta cc-delta-neutral">new this period</span>
    ) : null;
  const change = Math.round(
    ((metric.value - metric.previous) / metric.previous) * 100,
  );
  const tone = neutral
    ? "cc-delta-neutral"
    : change >= 0
      ? "cc-delta-up"
      : "cc-delta-down";
  return (
    <span
      className={`cc-delta ${tone}`}
      title={`Previous period: ${metric.previous}`}
    >
      {change >= 0 ? "▲" : "▼"} {Math.abs(change)}%
      <span className="cc-vs"> vs previous</span>
    </span>
  );
}

const greeting = () => {
  const hour = new Date().getHours();
  return hour < 12
    ? "Good morning"
    : hour < 18
      ? "Good afternoon"
      : "Good evening";
};

export function AdminOverview({
  api,
  totals,
  navigate,
  onError,
  describe,
}: {
  api: Api;
  totals: Totals | null;
  navigate: (path: string) => void;
  onError: (message: string) => void;
  describe: (entry: AdminAuditEntry) => string;
}) {
  const [days, setDays] = useState<Days>(30);
  const [data, setData] = useState<CommandCenter | null>(null);
  useEffect(() => {
    let live = true;
    setData(null);
    api<CommandCenter>(`/admin/command?days=${days}`)
      .then((r) => live && setData(r))
      .catch((error) => live && onError((error as Error).message));
    return () => {
      live = false;
    };
  }, [days]);
  const link = (to: string) => ({
    href: to,
    onClick: (event: MouseEvent<HTMLAnchorElement>) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button)
        return;
      event.preventDefault();
      navigate(to);
    },
  });

  if (!data) return <div className="admin-placeholder" aria-hidden="true" />;
  const m = data.metrics;
  const open = data.attention.length;
  const tiles: Array<{
    label: string;
    value: string;
    metric: CommandMetric;
    neutral?: boolean;
    sub?: string;
  }> = [
    {
      label: "Active players",
      value: m.activePlayers.value.toLocaleString(),
      metric: m.activePlayers,
      sub: `of ${m.activePlayers.accounts.toLocaleString()} accounts`,
    },
    {
      label: "New sign-ups",
      value: m.signups.value.toLocaleString(),
      metric: m.signups,
    },
    {
      label: "Stories finished",
      value: m.finishes.value.toLocaleString(),
      metric: m.finishes,
    },
    {
      label: "AI requests",
      value: m.aiRequests.value.toLocaleString(),
      metric: m.aiRequests,
      neutral: true,
    },
    {
      label: "Estimated AI spend",
      value: usd(m.aiSpend.value),
      metric: m.aiSpend,
      neutral: true,
    },
  ];

  return (
    <div className="cc">
      <div className="cc-head">
        <div>
          <h2 className="cc-title">{greeting()}</h2>
          <p className="cc-summary">
            {open ? (
              <a href="#attention">
                {open === 1
                  ? "1 thing needs your attention."
                  : `${open} things need your attention.`}
              </a>
            ) : (
              "Nothing needs your attention right now."
            )}{" "}
            <span className="cc-muted">
              Last {days} days, compared with the {days} before.
            </span>
          </p>
        </div>
        <div className="segmented" role="group" aria-label="Period">
          {commandDays.map((d) => (
            <button
              key={d}
              aria-pressed={days === d}
              onClick={() => setDays(d)}
            >
              {d} days
            </button>
          ))}
        </div>
      </div>

      <section className="cc-tiles" aria-label="Key numbers">
        {tiles.map((tile) => (
          <div key={tile.label} className="panel cc-tile">
            <span className="cc-label">{tile.label}</span>
            <strong className="cc-value">{tile.value}</strong>
            <span className="cc-tile-foot">
              <Delta metric={tile.metric} neutral={tile.neutral} />
              {tile.sub && <span className="cc-muted">{tile.sub}</span>}
            </span>
            {tile.metric.daily && <Sparkline values={tile.metric.daily} />}
          </div>
        ))}
      </section>

      <div className="cc-row">
        <section
          id="attention"
          className="panel cc-wide"
          aria-labelledby="cc-attention"
        >
          <div className="cc-card-head">
            <h3 id="cc-attention">Needs attention</h3>
            <span className="cc-muted">
              {open ? `${open} open` : "All clear"}
            </span>
          </div>
          {open ? (
            <ul className="cc-list">
              {data.attention.map((item) => (
                <li key={item.id} className="cc-attention">
                  <span
                    className={`cc-sev cc-sev-${item.severity}`}
                    aria-label={
                      item.severity === "critical"
                        ? "Urgent"
                        : item.severity === "warning"
                          ? "Warning"
                          : "Note"
                    }
                  >
                    {item.severity === "critical"
                      ? "!"
                      : item.severity === "warning"
                        ? "▲"
                        : "i"}
                  </span>
                  <span className="cc-attention-text">
                    <strong>{item.title}</strong>
                    <span className="cc-muted">{item.detail}</span>
                  </span>
                  {item.action && (
                    <a className="admin-action" {...link(item.action.path)}>
                      {item.action.label}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="admin-empty">
              No failed emails, uncertain image jobs, refusals or missing
              set-up.
            </p>
          )}
        </section>

        <section className="panel cc-narrow" aria-labelledby="cc-services">
          <div className="cc-card-head">
            <h3 id="cc-services">Services</h3>
          </div>
          <ul className="cc-list">
            {data.services.map((service) => (
              <li key={service.id} className="cc-service">
                <span
                  className={`cc-dot cc-dot-${service.state}`}
                  aria-label={
                    service.state === "ok"
                      ? "Set up"
                      : service.state === "warning"
                        ? "Needs a look"
                        : "Not set up"
                  }
                />
                <strong>{service.name}</strong>
                <span className="cc-muted">{service.detail}</span>
              </li>
            ))}
          </ul>
          <p className="cc-footnote">
            Shows what's set up on this deployment and recent failures; it
            doesn't contact the providers.
          </p>
        </section>
      </div>

      <div className="cc-row">
        <section className="panel cc-wide" aria-labelledby="cc-stories">
          <div className="cc-card-head">
            <h3 id="cc-stories">Most played stories</h3>
            <a {...link("/admin/stories")}>All stories</a>
          </div>
          {data.topStories.length ? (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Story</th>
                    <th>Players, {days} days</th>
                    <th>Completion</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topStories.map((story) => (
                    <tr key={story.id}>
                      <td>
                        <a
                          {...link(
                            `/admin/stories/${encodeURIComponent(story.id)}`,
                          )}
                        >
                          {story.title}
                        </a>
                      </td>
                      <td>{story.players}</td>
                      <td>
                        <span className="cc-meter">
                          <span
                            style={{
                              width: `${Math.round((story.completionRate ?? 0) * 100)}%`,
                            }}
                          />
                        </span>
                        {story.completionRate === null
                          ? "—"
                          : `${Math.round(story.completionRate * 100)}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="admin-empty">
              No stories were played in this period.
            </p>
          )}
        </section>

        <section className="panel cc-narrow" aria-labelledby="cc-activity">
          <div className="cc-card-head">
            <h3 id="cc-activity">Latest admin changes</h3>
            <a {...link("/admin/activity")}>Activity</a>
          </div>
          {data.activity.length ? (
            <ul className="cc-list">
              {data.activity.map((entry) => (
                <li key={entry.id} className="cc-feed">
                  <span>
                    <strong>{entry.actorEmail ?? entry.actorUid}</strong>{" "}
                    {describe(entry)}
                  </span>
                  <time className="cc-muted">
                    {new Date(entry.at).toLocaleString()}
                  </time>
                </li>
              ))}
            </ul>
          ) : (
            <p className="admin-empty">No admin changes yet.</p>
          )}
        </section>
      </div>

      {totals && (
        <section className="cc-glance" aria-label="At a glance">
          {(
            [
              ["Users", totals.users],
              ["Admins", totals.admins],
              ["Disabled", totals.disabledUsers],
              ["Published stories", totals.publishedStories],
              ["Hidden stories", totals.hiddenStories],
              ["Drafts", totals.drafts],
              ["Playthroughs", totals.playthroughs],
            ] as const
          ).map(([label, value]) => (
            <span key={label}>
              <strong>{value}</strong> {label}
            </span>
          ))}
        </section>
      )}
    </div>
  );
}
