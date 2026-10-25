// The admin Overview as a command center: the period's headline numbers
// against the period before, what needs attention, how each service is set
// up, the top stories and the latest admin activity.
import type { AdminAuditEntry } from "./admin";

export const commandDays = [7, 30, 90] as const;

export type CommandMetric = {
  value: number;
  // The same length of time just before; null where no history exists.
  previous: number | null;
  // One value per UTC day of the period, oldest first, for a sparkline.
  daily: number[] | null;
};

export type AttentionItem = {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
  // An admin page that deals with it, such as /admin/emails.
  action: { label: string; path: string } | null;
};

export type ServiceStatus = {
  id: "firebase" | "anthropic" | "openai" | "sendgrid" | "vercel";
  name: string;
  // ok: set up and no recent failures; warning: set up with recent
  // failures or switched off; off: not set up on this deployment.
  state: "ok" | "warning" | "off";
  detail: string;
};

export type CommandCenter = {
  days: number;
  from: string;
  to: string;
  metrics: {
    // Accounts that used the app in the period; no earlier history.
    activePlayers: CommandMetric & { accounts: number };
    signups: CommandMetric;
    // Players who reached an ending (a completed save last changed then).
    finishes: CommandMetric;
    aiRequests: CommandMetric;
    // Estimated USD at the prices in Settings.
    aiSpend: CommandMetric;
  };
  attention: AttentionItem[];
  services: ServiceStatus[];
  topStories: Array<{
    id: string;
    title: string;
    players: number;
    completionRate: number | null;
  }>;
  activity: AdminAuditEntry[];
};
