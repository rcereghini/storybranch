import type { AttentionItem, CommandCenter } from "../contracts/command";
import type { AiPrices, AiUsage } from "../contracts/usage";
import type { AnalyticsAccount, AnalyticsSave } from "./analytics";
import { dayKey, dayRange, usageTotals } from "./usage";

const dayMs = 86400000;

// The period's numbers, and the same length of time just before it where
// the data has that history. usage holds one entry per UTC day for both
// periods, oldest first (2 × days entries).
export function commandMetrics({
  now,
  days,
  accounts,
  saves,
  usage,
  prices,
}: {
  now: number;
  days: number;
  accounts: AnalyticsAccount[];
  saves: AnalyticsSave[];
  usage: Array<AiUsage & { day: string }>;
  prices: AiPrices;
}): CommandCenter["metrics"] {
  const current = dayRange(now, days);
  const previous = dayRange(now - days * dayMs, days);
  const series = (counts: Map<string, number>) => ({
    value: current.reduce((sum, d) => sum + (counts.get(d) ?? 0), 0),
    previous: previous.reduce((sum, d) => sum + (counts.get(d) ?? 0), 0),
    daily: current.map((d) => counts.get(d) ?? 0),
  });
  const tally = (keys: Array<string | null>) => {
    const counts = new Map<string, number>();
    for (const key of keys)
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    return counts;
  };

  // A completed save last changed when its player reached the ending; each
  // player counts once per story.
  const finished = new Map<string, number>();
  for (const s of saves)
    if (s.status === "completed") {
      const key = `${s.playerUid}|${s.storyId}`;
      finished.set(key, Math.max(finished.get(key) ?? 0, s.updatedAt));
    }

  const requests = new Map<string, number>();
  const spend = new Map<string, number>();
  for (const day of usage) {
    const totals = usageTotals(day, prices);
    requests.set(day.day, totals.claudeRequests + totals.images);
    spend.set(day.day, totals.estimatedUsd);
  }

  return {
    activePlayers: {
      value: accounts.filter(
        (a) => a.lastActiveAt !== null && now - a.lastActiveAt <= days * dayMs,
      ).length,
      previous: null,
      daily: null,
      accounts: accounts.length,
    },
    signups: series(
      tally(
        accounts.map((a) =>
          a.createdAt === null ? null : dayKey(a.createdAt),
        ),
      ),
    ),
    finishes: series(tally([...finished.values()].map((at) => dayKey(at)))),
    aiRequests: series(requests),
    aiSpend: series(spend),
  };
}

// What an admin should look at, most urgent first. Each item names the page
// that deals with it.
export function attentionItems(input: {
  failedEmails: { count: number; lastDetail: string | null };
  uncertainImages: number;
  refusalsToday: number;
  unpricedImages: number;
  switchedOff: string[];
  missing: string[];
}): AttentionItem[] {
  const items: AttentionItem[] = [];
  const plural = (n: number, one: string, many: string) =>
    `${n} ${n === 1 ? one : many}`;
  if (input.failedEmails.count)
    items.push({
      id: "failed-emails",
      severity: "critical",
      title: `${plural(input.failedEmails.count, "email", "emails")} failed to send in the last 24 hours`,
      detail:
        input.failedEmails.lastDetail ?? "See the email log for the reason.",
      action: { label: "Open emails", path: "/admin/emails" },
    });
  for (const name of input.missing)
    items.push({
      id: `missing-${name}`,
      severity: "critical",
      title: `${name} isn't set up on this deployment`,
      detail:
        "Features that depend on it are unavailable until its key is added in Vercel.",
      action: null,
    });
  if (input.uncertainImages)
    items.push({
      id: "uncertain-images",
      severity: "warning",
      title: `${plural(input.uncertainImages, "image job has", "image jobs have")} an uncertain outcome`,
      detail:
        "They may have been billed. Check OpenAI usage before anyone retries.",
      action: { label: "View usage", path: "/admin/usage" },
    });
  if (input.refusalsToday)
    items.push({
      id: "refusals",
      severity: "warning",
      title: `${plural(input.refusalsToday, "AI request was", "AI requests were")} refused today`,
      detail:
        "Claude declined them. A sudden rise can mean misuse or a prompt problem.",
      action: { label: "View usage", path: "/admin/usage" },
    });
  for (const name of input.switchedOff)
    items.push({
      id: `off-${name}`,
      severity: "info",
      title: `${name} is switched off for everyone`,
      detail: "Players don't see it until it's switched back on.",
      action: { label: "Open settings", path: "/admin/settings" },
    });
  if (input.unpricedImages)
    items.push({
      id: "image-prices",
      severity: "info",
      title: "Image prices aren't set",
      detail: `Spend leaves out ${plural(input.unpricedImages, "image", "images")} in this period until prices are added.`,
      action: { label: "Set prices", path: "/admin/settings" },
    });
  return items;
}
