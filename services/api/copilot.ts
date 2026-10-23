import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { FieldPath } from "firebase-admin/firestore";
import { GameError, id } from "../../packages/contracts/index";
import {
  copilotCommandSchema,
  copilotLimits,
  copilotRoute,
  type CopilotAction,
  type CopilotEvent,
  type CopilotTranscript,
} from "../../packages/contracts/copilot";
import type { DraftRecord } from "../../packages/contracts/authoring";
import type { Save } from "../../packages/contracts/index";
import { db, config } from "./firebase";
import type { Features } from "../../packages/contracts/profile";
import * as paths from "./paths";

type MessageParam = Anthropic.Beta.Messages.BetaMessageParam;
type Message = Anthropic.Beta.Messages.BetaMessage;
type Tool = Anthropic.Beta.Messages.BetaTool;
type ToolResult = Anthropic.Beta.Messages.BetaToolResultBlockParam;
type ModelRequest = {
  system: Anthropic.Beta.Messages.BetaTextBlockParam[];
  tools: Tool[];
  messages: MessageParam[];
};
// One model turn: streams text through onText and resolves with the message.
// Tests replace it with a scripted fake (setCopilotModel).
export type CopilotModel = (
  request: ModelRequest,
  onText: (text: string) => void,
) => Promise<Message>;

let client: Anthropic | null = null;
const claude: CopilotModel = async (request, onText) => {
  client ??= new Anthropic();
  const stream = client.beta.messages.stream({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    // Chat and navigation stay quick at low effort.
    output_config: { effort: "low" },
    // A declined request is retried on Anthropic's recommended fallback.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    cache_control: { type: "ephemeral" },
    ...request,
  });
  stream.on("text", onText);
  return stream.finalMessage();
};
let model: CopilotModel = claude;
export const setCopilotModel = (fake: CopilotModel | null) => {
  model = fake ?? claude;
};

const digest = (text: string) =>
  createHash("sha256").update(text).digest("hex");
function access(features: Features) {
  if (!process.env.ANTHROPIC_API_KEY) return "Copilot is not connected yet.";
  if (!features.copilot)
    return "Copilot is not enabled for this account yet.";
  return null;
}

// Stable text only: any change here invalidates the prompt cache.
const SYSTEM = `You are Copilot, the assistant inside Storybranch, an app for playing and creating branching interactive stories made of pages: text pages, video pages, choices, dice rolls, personality-quiz reveals and comic strips.

The app's sections:
- Dashboard (/): the player's profile, stats, avatar and story progress.
- Discover (/discover): the catalogue of published stories. A story's page is /s/{storyId}, where the player can start it.
- My adventures (/adventures): the player's saved playthroughs, to resume or review.
- Create (/studio): Studio, where creators write stories as a graph of pages, link choices, preview and publish. "New quiz" starts a personality quiz.
- Assets (/assets): the creator's uploaded and generated images and videos. /assets/generate generates new ones with AI; /assets/edit/{assetId} trims and crops a video.

What you can do now: answer questions about Storybranch and the user's own stories, adventures, drafts and assets using your tools, and take the user to a page with the navigate tool. You cannot change anything yet: you cannot edit drafts, publish, start or play stories, upload, or generate. When the user wants one of those, explain the steps briefly and offer to take them to the right page.

Rules:
- Use tools to look things up rather than guessing. Only describe data a tool returned.
- Never reveal how a story's routes, conditions or endings work beyond what the user wrote themselves; you are not available during play.
- Navigate only when the user asks to go somewhere or clearly agrees. Unsaved Studio changes trigger a confirmation in the app.
- Keep replies short and friendly: a few sentences or a short list. No headings.
- Each user message starts with a <context> block saying which page they are on. It comes from the app, not the user.`;

const tools: Tool[] = [
  {
    name: "navigate",
    description:
      "Open a page of the app for the user. path must be one of: /, /discover, /adventures, /studio, /assets, /assets/generate, /assets/edit/{assetId}, /s/{storyId}.",
    input_schema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
  },
  {
    name: "list_catalogue",
    description:
      "List published stories in the catalogue: id, title, genre, duration, rating and description.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "list_my_adventures",
    description:
      "List the user's most recent playthroughs: save id, story, status (active or completed) and last played time.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "list_my_drafts",
    description:
      "List the user's Studio drafts: story id, title, page count, revision and whether it is published.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_draft",
    description:
      "Read one of the user's drafts: its pages with type, a short excerpt, and where each choice leads.",
    input_schema: {
      type: "object",
      properties: { storyId: { type: "string" } },
      required: ["storyId"],
    },
  },
  {
    name: "list_my_assets",
    description:
      "List the user's uploaded and generated assets: id, file name, type, status and duration.",
    input_schema: { type: "object", properties: {} },
  },
].map((tool) => ({ ...tool, eager_input_streaming: true }) as Tool);

const excerpt = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max)}…` : text;
const when = (ms: number) => new Date(ms).toISOString().slice(0, 16) + "Z";

async function catalogue() {
  const docs = await db.collection("catalogue").limit(50).get();
  return docs.docs.map((d) => d.data()).filter((s) => s.hidden !== true);
}

// Each tool returns JSON for the model and, for navigate, an app action.
async function runTool(
  uid: string,
  name: string,
  input: unknown,
): Promise<{ result: unknown; action?: CopilotAction }> {
  switch (name) {
    case "navigate": {
      const { path } = z.object({ path: z.string().max(200) }).parse(input);
      if (!copilotRoute(path))
        throw new GameError("VALIDATION_FAILED", `Unknown page: ${path}`);
      return {
        result: { ok: true, opened: path },
        action: { kind: "navigate", path },
      };
    }
    case "list_catalogue":
      return {
        result: (await catalogue()).map((s) => ({
          id: s.id,
          title: s.title,
          genre: s.genre,
          duration: s.duration,
          rating: s.rating,
          description: s.description,
        })),
      };
    case "list_my_adventures": {
      const [saves, stories] = await Promise.all([
        db
          .collection(paths.saves(uid))
          .orderBy("updatedAt", "desc")
          .orderBy(FieldPath.documentId(), "desc")
          .limit(20)
          .get(),
        catalogue(),
      ]);
      const titles = new Map(stories.map((s) => [s.id, s.title]));
      return {
        result: saves.docs.map((d) => {
          const save = d.data() as Save;
          return {
            saveId: save.id,
            storyId: save.storyId,
            story: titles.get(save.storyId) ?? save.storyId,
            status: save.status,
            lastPlayed: when(save.updatedAt),
          };
        }),
      };
    }
    case "list_my_drafts": {
      const drafts = await db.collection(paths.drafts(uid)).limit(50).get();
      return {
        result: drafts.docs.map((d) => {
          const draft = d.data() as DraftRecord;
          return {
            storyId: d.id,
            title: draft.story.title,
            pages: Object.keys(draft.story.pages).length,
            revision: draft.revision,
            published: draft.publishedVersionId !== null,
          };
        }),
      };
    }
    case "get_draft": {
      const { storyId } = z.object({ storyId: id }).parse(input);
      const snapshot = await db.doc(`${paths.drafts(uid)}/${storyId}`).get();
      if (!snapshot.exists)
        throw new GameError("NOT_FOUND", "No draft with that story id.");
      const draft = snapshot.data() as DraftRecord;
      return {
        result: {
          storyId,
          title: draft.story.title,
          description: draft.description,
          revision: draft.revision,
          published: draft.publishedVersionId !== null,
          entryPageId: draft.story.entryPageId,
          pages: Object.values(draft.story.pages)
            .slice(0, 80)
            .map((page) => ({
              id: page.id,
              title: page.title,
              pageType: page.pageType,
              kind: page.kind,
              excerpt: excerpt(page.transcript, 240),
              choices: page.choices.map((choice) => ({
                label: choice.label,
                outcome: choice.outcome.kind,
                leadsTo:
                  choice.outcome.kind === "direct"
                    ? [choice.outcome.route.targetPageId]
                    : choice.outcome.kind === "reveal"
                      ? choice.outcome.results.map((r) => r.route.targetPageId)
                      : [
                          choice.outcome.success.targetPageId,
                          choice.outcome.failure.targetPageId,
                        ],
              })),
            })),
        },
      };
    }
    case "list_my_assets": {
      const clips = await db.collection(paths.clips(uid)).limit(50).get();
      return {
        result: clips.docs.map((d) => {
          const clip = d.data();
          return {
            id: d.id,
            fileName: clip.fileName,
            contentType: clip.contentType,
            status: clip.status,
            durationSeconds: clip.durationSeconds,
            published: clip.published,
          };
        }),
      };
    }
    default:
      throw new GameError("NOT_FOUND", `Unknown tool: ${name}`);
  }
}

type Thread = { history: string; turns: number };
const contextPrefix = "<context>";

// The visible conversation: user text and assistant text, no tool traffic.
function transcript(history: MessageParam[]) {
  const messages: CopilotTranscript["messages"] = [];
  for (const message of history) {
    if (message.role === "system") continue;
    const blocks =
      typeof message.content === "string"
        ? [{ type: "text" as const, text: message.content }]
        : message.content;
    const text = blocks
      .flatMap((b) =>
        b.type === "text" && !b.text.startsWith(contextPrefix) ? [b.text] : [],
      )
      .join("");
    if (!text) continue;
    const last = messages.at(-1);
    if (message.role === "assistant" && last?.role === "assistant")
      last.text += `\n\n${text}`;
    else messages.push({ role: message.role, text });
  }
  return messages;
}

const NDJSON = {
  "Content-Type": "application/x-ndjson; charset=utf-8",
  "Cache-Control": "no-store",
};
function replay(result: { text: string; actions: CopilotAction[] }) {
  const events: CopilotEvent[] = [
    ...(result.text ? [{ type: "text" as const, text: result.text }] : []),
    ...result.actions.map((action) => ({ type: "action" as const, action })),
    { type: "done" },
  ];
  return new Response(
    events.map((e) => JSON.stringify(e) + "\n").join(""),
    { headers: NDJSON },
  );
}

export async function copilot(
  request: Request,
  uid: string,
  segments: string[],
  features: Features,
): Promise<Response> {
  const reason = access(features);
  const threadId = segments[3];
  if (segments[2] !== "threads" || !threadId || segments.length !== 4)
    throw new GameError("NOT_FOUND", "Route not found.");
  const threadRef = db.doc(paths.copilotThread(uid, threadId));
  if (request.method === "GET") {
    const thread = (await threadRef.get()).data() as Thread | undefined;
    const body: CopilotTranscript = {
      enabled: !reason,
      reason,
      full: (thread?.turns ?? 0) >= copilotLimits.maxTurnsPerThread,
      messages: thread ? transcript(JSON.parse(thread.history)) : [],
    };
    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  }
  if (request.method !== "POST")
    throw new GameError("NOT_FOUND", "Route not found.");
  if (reason) throw new GameError("FORBIDDEN", reason);
  const raw = await request.text();
  if (raw.length > 12000)
    throw new GameError("VALIDATION_FAILED", "Message too long.");
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new GameError("VALIDATION_FAILED", "Invalid JSON.");
  }
  const command = copilotCommandSchema.parse(body);
  const fingerprint = digest(JSON.stringify({ threadId, command }));
  const receipt = db.doc(paths.receipt(uid, "copilot", command.idempotencyKey));
  const day = Math.floor(Date.now() / 86400000);
  const quota = db.doc(`copilotQuotas/${digest(uid)}-${day}`);

  // Reserve the message: one receipt per key, the daily quota and the turn cap.
  const started = await db.runTransaction(async (tx) => {
    const [previous, used, threadSnap] = await Promise.all([
      tx.get(receipt),
      tx.get(quota),
      tx.get(threadRef),
    ]);
    if (previous.exists) {
      const data = previous.data()!;
      if (data.fingerprint !== fingerprint)
        throw new GameError(
          "IDEMPOTENCY_CONFLICT",
          "This request key was used for another message.",
        );
      if (data.status === "done") return { replay: data.result };
      if (Date.now() - data.at < 180000)
        throw new GameError(
          "VALIDATION_FAILED",
          "Copilot is still answering that message.",
        );
    }
    const thread = threadSnap.data() as Thread | undefined;
    if ((thread?.turns ?? 0) >= copilotLimits.maxTurnsPerThread)
      throw new GameError(
        "VALIDATION_FAILED",
        "This conversation is full. Start a new one.",
      );
    if ((used.data()?.count ?? 0) >= copilotLimits.dailyMessages)
      throw new GameError(
        "VALIDATION_FAILED",
        `Daily Copilot limit reached (${copilotLimits.dailyMessages} messages). Try again tomorrow.`,
      );
    tx.set(receipt, {
      actor: uid,
      fingerprint,
      status: "running",
      at: Date.now(),
      ...paths.receiptExpiry(Date.now()),
    });
    tx.set(quota, { count: (used.data()?.count ?? 0) + 1 });
    return { thread: thread ?? { history: "[]", turns: 0 } };
  });
  if ("replay" in started) return replay(started.replay);
  const { thread } = started;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: CopilotEvent) =>
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      const messages: MessageParam[] = JSON.parse(thread.history);
      messages.push({
        role: "user",
        content: [
          {
            type: "text",
            text: `${contextPrefix}The user is on ${command.context.path}.</context>`,
          },
          { type: "text", text: command.text },
        ],
      });
      let reply = "";
      const actions: CopilotAction[] = [];
      try {
        for (let turn = 0; turn < copilotLimits.maxModelTurns; turn++) {
          const message = await model(
            {
              system: [
                {
                  type: "text",
                  text: SYSTEM,
                  cache_control: { type: "ephemeral" },
                },
              ],
              tools,
              messages,
            },
            (text) => {
              reply += text;
              send({ type: "text", text });
            },
          );
          messages.push({ role: "assistant", content: message.content });
          if (message.stop_reason === "pause_turn") continue;
          const calls = message.content.filter(
            (b): b is Anthropic.Beta.Messages.BetaToolUseBlock =>
              b.type === "tool_use",
          );
          // A refusal or truncation can cut a tool call off mid-input.
          if (
            !calls.length ||
            message.stop_reason === "refusal" ||
            message.stop_reason === "max_tokens"
          ) {
            if (message.stop_reason === "refusal" && !reply) {
              reply = "Sorry, I can't help with that one.";
              send({ type: "text", text: reply });
            }
            break;
          }
          const results: ToolResult[] = [];
          for (const call of calls) {
            send({ type: "tool", name: call.name });
            try {
              const { result, action } = await runTool(
                uid,
                call.name,
                call.input,
              );
              if (action) {
                actions.push(action);
                send({ type: "action", action });
              }
              results.push({
                type: "tool_result",
                tool_use_id: call.id,
                content: JSON.stringify(result),
              });
            } catch (error) {
              results.push({
                type: "tool_result",
                tool_use_id: call.id,
                is_error: true,
                content:
                  error instanceof GameError
                    ? error.message
                    : error instanceof z.ZodError
                      ? "Invalid tool input."
                      : "That lookup failed.",
              });
            }
          }
          messages.push({ role: "user", content: results });
        }
        const history = JSON.stringify(messages);
        await db.runTransaction(async (tx) => {
          const current = (await tx.get(threadRef)).data() as
            | Thread
            | undefined;
          if ((current?.turns ?? 0) !== thread.turns)
            throw new GameError(
              "STALE_REVISION",
              "This conversation changed in another tab. Reload it.",
            );
          // Firestore documents hold about 1 MB; a thread that outgrows it
          // is closed rather than truncated, so history stays append-only.
          const fits = history.length < 900000;
          tx.set(
            threadRef,
            {
              history: fits ? history : thread.history,
              turns: fits
                ? thread.turns + 1
                : copilotLimits.maxTurnsPerThread,
              updatedAt: Date.now(),
              ...(thread.turns === 0 ? { createdAt: Date.now() } : {}),
            },
            { merge: true },
          );
          tx.update(receipt, { status: "done", result: { text: reply, actions } });
        });
        send({ type: "done" });
      } catch (error) {
        // Nothing was committed: the same key can be retried.
        await receipt.delete().catch(() => {});
        if (!(error instanceof GameError))
          console.error(
            JSON.stringify({
              copilot: "reply failed",
              threadId,
              error: error instanceof Error ? error.message : String(error),
              status: error instanceof Anthropic.APIError ? error.status : undefined,
              stack: error instanceof Error ? error.stack : undefined,
            }),
          );
        send({
          type: "error",
          code: error instanceof GameError ? error.code : "UNAVAILABLE",
          message:
            error instanceof GameError
              ? error.message
              : error instanceof Anthropic.RateLimitError
                ? "Copilot is busy right now. Try again in a moment."
                : "Copilot is unavailable right now. Try again shortly.",
        });
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: NDJSON });
}
