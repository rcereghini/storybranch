import { GameError } from "../../packages/contracts/index";
import type { AdminAuditEntry } from "../../packages/contracts/admin";
import {
  commandDays,
  type CommandCenter,
  type ServiceStatus,
} from "../../packages/contracts/command";
import { attentionItems, commandMetrics } from "../../packages/domain/command";
import { dayRange, usageTotals } from "../../packages/domain/usage";
import { AUDIT } from "./admin-audit";
import { allUsers } from "./admin-users";
import { allSaves } from "./analytics";
import { emailFrom, senderConfigured } from "./email";
import { config, db } from "./firebase";
import { appSettings } from "./settings";
import { aiUsageDays } from "./usage-report";

const dayMs = 86400000;
// A job still submitting after the function's time limit was cut off.
const staleJobMs = 300000;

// GET /api/admin/command?days=7|30|90: the Overview, from data the app
// already keeps. Services are reported as set up or not; nothing calls the
// providers, so loading the page costs nothing.
export async function commandCenter(days: number): Promise<CommandCenter> {
  if (!(commandDays as readonly number[]).includes(days))
    throw new GameError("VALIDATION_FAILED", "Choose 7, 30 or 90 days.");
  const now = Date.now();
  const [users, saves, usage, settings, catalogue, failed, jobs, audit] =
    await Promise.all([
      allUsers(),
      allSaves(),
      aiUsageDays(days * 2),
      appSettings(),
      db.collection("catalogue").get(),
      // Equality-only queries, so no composite index; recent ones picked here.
      db
        .collection("emailLog")
        .where("status", "==", "failed")
        .limit(500)
        .get(),
      db
        .collection("generationJobs")
        .where("status", "in", ["uncertain", "submitting"])
        .limit(500)
        .get(),
      db.collection(AUDIT).orderBy("at", "desc").limit(8).get(),
    ]);

  const metrics = commandMetrics({
    now,
    days,
    accounts: users.map((u) => ({
      createdAt: u.createdAt ? Date.parse(u.createdAt) : null,
      lastActiveAt: u.lastActive ? Date.parse(u.lastActive) : null,
    })),
    saves: saves.saves,
    usage,
    prices: settings.prices,
  });

  const failedRecent = failed.docs
    .map((d) => d.data())
    .filter((e) => typeof e.at === "number" && now - e.at <= dayMs)
    .sort((a, b) => b.at - a.at);
  const uncertainImages = jobs.docs.filter((d) => {
    const job = d.data();
    return (
      job.status === "uncertain" ||
      (typeof job.createdAt === "number" && now - job.createdAt > staleJobMs)
    );
  }).length;
  const period = usage.slice(-days);
  const today = usage.at(-1);
  const live = config.mode === "firebase";
  const anthropic = !!process.env.ANTHROPIC_API_KEY;
  const openai = !!process.env.OPENAI_API_KEY;
  const sending = senderConfigured();
  const switchedOff = [
    !settings.ai.copilot && "Copilot",
    !settings.ai.writingHelp && "Studio writing help",
    !settings.ai.imageGeneration && "Image generation",
  ].filter((name): name is string => !!name);

  const attention = attentionItems({
    failedEmails: {
      count: failedRecent.length,
      lastDetail: failedRecent[0]
        ? `${failedRecent[0].template ?? "Email"}: ${failedRecent[0].detail ?? "failed"}`
        : null,
    },
    uncertainImages,
    refusalsToday: today ? usageTotals(today, settings.prices).refusals : 0,
    unpricedImages: period.reduce(
      (sum, day) =>
        sum + usageTotals(day, settings.prices, "image").unpricedRequests,
      0,
    ),
    switchedOff,
    // Locally the keys are expected to be missing.
    missing: live
      ? [
          !anthropic && "Anthropic",
          !openai && "OpenAI",
          !sending && "SendGrid",
        ].filter((name): name is string => !!name)
      : [],
  });

  const services: ServiceStatus[] = [
    {
      id: "firebase",
      name: "Firebase",
      state: "ok",
      detail: live ? "Auth, Firestore and Storage" : "Local emulators",
    },
    {
      id: "anthropic",
      name: "Anthropic",
      state: !anthropic
        ? "off"
        : settings.ai.copilot && settings.ai.writingHelp
          ? "ok"
          : "warning",
      detail: anthropic
        ? `Claude Opus 5.5 · ${settings.ai.copilot && settings.ai.writingHelp ? "Copilot and writing help on" : "partly switched off"}`
        : "No API key",
    },
    {
      id: "openai",
      name: "OpenAI",
      state: !openai
        ? "off"
        : settings.ai.imageGeneration && !uncertainImages
          ? "ok"
          : "warning",
      detail: !openai
        ? "No API key"
        : !settings.ai.imageGeneration
          ? "gpt-image-2 · image generation switched off"
          : uncertainImages
            ? `gpt-image-2 · ${uncertainImages} uncertain`
            : "gpt-image-2 · image generation on",
    },
    {
      id: "sendgrid",
      name: "SendGrid",
      state: !sending ? "off" : failedRecent.length ? "warning" : "ok",
      detail: !sending
        ? live
          ? "No API key"
          : "Emails aren't sent locally"
        : failedRecent.length
          ? `${failedRecent.length} failed in 24 hours`
          : `Sending from ${emailFrom}`,
    },
    {
      id: "vercel",
      name: "Vercel",
      state: "ok",
      detail: process.env.VERCEL_ENV
        ? `${process.env.VERCEL_ENV}${process.env.VERCEL_GIT_COMMIT_SHA ? ` · ${process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7)}` : ""}`
        : "Local server",
    },
  ];

  // The stories most played in the period; completion is all-time.
  const start = Date.parse(`${dayRange(now, days)[0]}T00:00:00Z`);
  const byStory = new Map<
    string,
    { recent: Set<string>; players: Set<string>; finishers: Set<string> }
  >();
  for (const s of saves.saves) {
    const t =
      byStory.get(s.storyId) ??
      byStory
        .set(s.storyId, {
          recent: new Set(),
          players: new Set(),
          finishers: new Set(),
        })
        .get(s.storyId)!;
    t.players.add(s.playerUid);
    if (s.status === "completed") t.finishers.add(s.playerUid);
    if (s.updatedAt >= start) t.recent.add(s.playerUid);
  }
  const titles = new Map(
    catalogue.docs.map((d) => [d.id, (d.data().title as string) ?? d.id]),
  );
  const topStories = [...byStory]
    .filter(([, t]) => t.recent.size > 0)
    .sort(([, a], [, b]) => b.recent.size - a.recent.size)
    .slice(0, 5)
    .map(([id, t]) => ({
      id,
      title: titles.get(id) ?? id,
      players: t.recent.size,
      completionRate: t.players.size ? t.finishers.size / t.players.size : null,
    }));

  const range = dayRange(now, days);
  return {
    days,
    from: range[0],
    to: range.at(-1)!,
    metrics,
    attention,
    services,
    topStories,
    activity: audit.docs.map(
      (d) => ({ id: d.id, ...d.data() }) as AdminAuditEntry,
    ),
  };
}
