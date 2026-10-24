import { useEffect, useState } from "react";
import type { createApi } from "../../../packages/api-client/index";
import {
  analyticsDays,
  type SiteAnalytics,
} from "../../../packages/contracts/analytics";
import { DailyBars } from "./DailyBars";

type Api = ReturnType<typeof createApi>;
type Days = (typeof analyticsDays)[number];
// Page views are counted by Vercel Web Analytics on this project.
const vercelAnalytics =
  "https://vercel.com/opin-projects/storybranch/analytics";
const percent = (rate: number | null) =>
  rate === null ? "—" : `${Math.round(rate * 100)}%`;

export function AdminAnalytics({
  api,
  onError,
}: {
  api: Api;
  onError: (message: string) => void;
}) {
  const [days, setDays] = useState<Days>(30);
  const [data, setData] = useState<SiteAnalytics | null>(null);
  useEffect(() => {
    let live = true;
    setData(null);
    api<SiteAnalytics>(`/admin/analytics?days=${days}`)
      .then((r) => live && setData(r))
      .catch((error) => live && onError((error as Error).message));
    return () => {
      live = false;
    };
  }, [days]);

  return (
    <section className="panel admin-usage">
      <div className="row-head">
        <h2 className="panel-title">Players and stories</h2>
        <div className="segmented" role="group" aria-label="Period">
          {analyticsDays.map((d) => (
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
      {data ? (
        <>
          <div className="admin-stats">
            {(
              [
                ["Accounts", data.accounts],
                [`New sign-ups, ${days} days`, data.signups],
                ["Active today", data.active.day],
                ["Active this week", data.active.week],
                ["Active this month", data.active.month],
                [`Players, ${days} days`, data.playersInPeriod],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="admin-stat panel">
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <p className="admin-sub">
            Active means a signed-in session was used in the last 24 hours, 7
            days or 30 days. Players are accounts that saved progress in any
            story in the period.
          </p>

          <DailyBars
            caption="New sign-ups per day (UTC)"
            points={data.signupsByDay.map((d) => ({
              day: d.day,
              value: d.count,
              detail:
                d.count === 1 ? "1 new sign-up" : `${d.count} new sign-ups`,
            }))}
          />

          <h3 className="admin-subtitle">Stories</h3>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Story</th>
                  <th>Players</th>
                  <th>Finished</th>
                  <th>Completion</th>
                  <th>Played, {days} days</th>
                  <th>Last played</th>
                </tr>
              </thead>
              <tbody>
                {data.stories.map((story) => (
                  <tr key={story.id}>
                    <td>
                      <strong>{story.title}</strong>
                      {story.hidden && (
                        <span className="admin-sub">Hidden from Discover</span>
                      )}
                    </td>
                    <td>{story.players}</td>
                    <td>{story.finishers}</td>
                    <td>{percent(story.completionRate)}</td>
                    <td>{story.activePlayers}</td>
                    <td>
                      {story.lastPlayedAt
                        ? new Date(story.lastPlayedAt).toLocaleDateString()
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="admin-sub">
            Players and finishes count each account once per story, ever.
            Completion is the share of players who reached an ending.
            {data.savesCapped
              ? ` Only the first ${data.savesRead.toLocaleString()} saves were read, so these numbers are partial.`
              : ""}
          </p>

          <h3 className="admin-subtitle">Page views</h3>
          <p className="admin-sub">
            Visits, top pages, referrers and countries are counted by Vercel Web
            Analytics, without cookies. Private pages are grouped, such as all
            playthroughs under /play/[saveId].
          </p>
          <a
            className="admin-action admin-external"
            href={vercelAnalytics}
            target="_blank"
            rel="noreferrer"
          >
            Open Vercel Analytics ↗
          </a>
        </>
      ) : (
        <div className="admin-placeholder" aria-hidden="true" />
      )}
    </section>
  );
}
