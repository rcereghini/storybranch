import { z } from "zod";
import { id } from "./index";

export const copilotLimits = {
  maxChars: 2000,
  maxTurnsPerThread: 40,
  maxModelTurns: 8,
  dailyMessages: 100,
} as const;

export const copilotCommandSchema = z
  .object({
    idempotencyKey: id,
    text: z.string().trim().min(1).max(copilotLimits.maxChars),
    context: z.object({ path: z.string().max(300) }).strict(),
  })
  .strict();
export type CopilotCommand = z.infer<typeof copilotCommandSchema>;

export type CopilotAction = { kind: "navigate"; path: string };
// One line of the streamed reply. "done" or "error" is always last.
export type CopilotEvent =
  | { type: "text"; text: string }
  | { type: "tool"; name: string }
  | { type: "action"; action: CopilotAction }
  | { type: "done" }
  | { type: "error"; code: string; message: string };

export type CopilotTranscript = {
  enabled: boolean;
  reason: string | null;
  full: boolean;
  messages: Array<{ role: "user" | "assistant"; text: string }>;
};

// Pages Copilot may open. Play and shared-page routes are excluded: they
// would let Copilot reveal routes and outcomes, and it is not offered there.
const routes = [
  /^\/$/,
  /^\/discover$/,
  /^\/adventures$/,
  /^\/studio$/,
  /^\/assets$/,
  /^\/assets\/generate$/,
  /^\/assets\/edit\/[a-zA-Z0-9_-]{1,80}$/,
  /^\/s\/[a-zA-Z0-9_-]{1,80}$/,
];
export const copilotRoute = (path: string) =>
  routes.some((route) => route.test(path));
export const copilotAvailable = (path: string) =>
  !path.startsWith("/play/") && !path.startsWith("/p/");
