import { useEffect, useState } from "react";
import type { createApi } from "../../../packages/api-client/index";
import {
  usageReportDays,
  type AiUsageReport,
  type AiUsageTotals,
} from "../../../packages/contracts/usage";
import { DailyBars } from "./DailyBars";

type Api = ReturnType<typeof createApi>;
type Days = (typeof usageReportDays)[number];

export const usd = (value: number) =>
  value > 0 && value < 0.01 ? "<$0.01" : `$${value.toFixed(2)}`;
const requests = (t: AiUsageTotals) => t.claudeRequests + t.images;

export function AdminUsage({
  api,
  onError,
}: {
  api: Api;
  onError: (message: string) => void;
}) {
  const [days, setDays] = useState<Days>(30);
  const [report, setReport] = useState<AiUsageReport | null>(null);
  useEffect(() => {
    let live = true;
    setReport(null);
    api<AiUsageReport>(`/admin/usage?days=${days}`)
      .then((r) => live && setReport(r))
      .catch((error) => live && onError((error as Error).message));
    return () => {
      live = false;
    };
  }, [days]);

  return (
    <section className="panel admin-usage">
      <div className="row-head">
        <h2 className="panel-title">AI usage and spend</h2>
        <div className="segmented" role="group" aria-label="Period">
          {usageReportDays.map((d) => (
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
      {report ? (
        <>
          <div className="admin-stats">
            {(
              [
                ["Estimated spend", usd(report.totals.estimatedUsd)],
                ["AI requests", requests(report.totals)],
                ["Images", report.totals.images],
                ["Refusals", report.totals.refusals],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="admin-stat panel">
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>

          <DailyBars
            caption="AI requests per day (UTC)"
            points={report.days.map((day) => ({
              day: day.day,
              value: requests(day.totals),
              detail: `${requests(day.totals)} requests, ${usd(day.totals.estimatedUsd)} estimated`,
            }))}
          />

          <h3 className="admin-subtitle">By feature</h3>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Feature</th>
                  <th>Requests</th>
                  <th>Refusals</th>
                  <th>Estimated spend</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ["Copilot", report.byFeature.copilot],
                    ["Writing help", report.byFeature.assist],
                    ["Images", report.byFeature.image],
                  ] as const
                ).map(([label, t]) => (
                  <tr key={label}>
                    <td>{label}</td>
                    <td>{requests(t)}</td>
                    <td>{t.refusals}</td>
                    <td>
                      {usd(t.estimatedUsd)}
                      {t.unpricedRequests > 0 && (
                        <span className="admin-sub">
                          {t.unpricedRequests} not priced
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="admin-subtitle">Top users</h3>
          {report.topUsers.length ? (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Claude requests</th>
                    <th>Images</th>
                    <th>Estimated spend</th>
                  </tr>
                </thead>
                <tbody>
                  {report.topUsers.map((user) => (
                    <tr key={user.uid}>
                      <td>
                        <strong>{user.displayName}</strong>
                        <span className="admin-sub">
                          {user.email ?? user.uid}
                        </span>
                      </td>
                      <td>{user.claudeRequests}</td>
                      <td>{user.images}</td>
                      <td>{usd(user.estimatedUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="admin-empty">No AI usage in this period.</p>
          )}
          <p className="admin-empty">
            Estimates use list prices for Claude tokens. Image prices aren't set
            yet, so images are counted but not priced. The real bill is in the
            Anthropic and OpenAI consoles. Usage is recorded from this release
            on.
          </p>
        </>
      ) : (
        <div className="admin-placeholder" aria-hidden="true" />
      )}
    </section>
  );
}
