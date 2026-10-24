import type Anthropic from "@anthropic-ai/sdk";
import { FieldValue } from "firebase-admin/firestore";
import type {
  ClaudeFeature,
  ClaudeTokens,
  ImageCounts,
  ImageQuality,
} from "../../packages/contracts/usage";
import { dayKey } from "../../packages/domain/usage";
import { db } from "./firebase";

export type UsageMessage = Pick<
  Anthropic.Beta.Messages.BetaMessage,
  "model" | "stop_reason" | "usage"
>;

// Adds to today's totals (aiUsage/{day}) and the user's
// (aiUsageUsers/{day}_{uid}), read by the admin Usage tab. A failed write is
// logged, never surfaced: the user's request already succeeded.
async function add(uid: string, usage: object) {
  const day = dayKey(Date.now());
  try {
    const batch = db.batch();
    batch.set(db.doc(`aiUsage/${day}`), { day, ...usage }, { merge: true });
    batch.set(
      db.doc(`aiUsageUsers/${day}_${uid}`),
      { day, uid, ...usage },
      { merge: true },
    );
    await batch.commit();
  } catch (error) {
    console.error("AI usage was not recorded", error);
  }
}
const inc = (value: number) => FieldValue.increment(value);

// One JSON log line per paid AI call (token counts only: never prompts,
// replies or user IDs), plus the daily totals.
export async function recordClaudeUsage(
  uid: string,
  feature: ClaudeFeature,
  message: UsageMessage,
) {
  const { usage } = message;
  console.log(
    JSON.stringify({
      aiUsage: feature,
      model: message.model,
      stopReason: message.stop_reason,
      inputTokens: usage.input_tokens,
      cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
      cacheReadTokens: usage.cache_read_input_tokens ?? 0,
      outputTokens: usage.output_tokens,
      ...(usage.iterations?.length ? { iterations: usage.iterations } : {}),
    }),
  );
  // A declined request retried on a fallback model reports each step with
  // its own model and tokens; otherwise the reply's totals are one step.
  const steps = usage.iterations?.flatMap((step) =>
    step.type === "message" || step.type === "fallback_message"
      ? [{ ...step, model: step.model ?? message.model }]
      : [],
  );
  const byModel: Record<string, ClaudeTokens> = {};
  const tokens = (model: string) =>
    (byModel[model] ??= {
      requests: 0,
      inputTokens: 0,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
      outputTokens: 0,
      refusals: 0,
    });
  for (const step of steps?.length
    ? steps
    : [{ ...usage, model: message.model }]) {
    const t = tokens(step.model);
    t.inputTokens += step.input_tokens;
    t.cacheWriteTokens += step.cache_creation_input_tokens ?? 0;
    t.cacheReadTokens += step.cache_read_input_tokens ?? 0;
    t.outputTokens += step.output_tokens;
  }
  tokens(message.model).requests += 1;
  if (message.stop_reason === "refusal") tokens(message.model).refusals += 1;
  await add(uid, {
    claude: {
      [feature]: Object.fromEntries(
        Object.entries(byModel).map(([model, t]) => [
          model,
          Object.fromEntries(
            Object.entries(t).map(([field, value]) => [field, inc(value)]),
          ),
        ]),
      ),
    },
  });
}

export async function recordImageUsage(
  uid: string,
  details: {
    quality: ImageQuality;
    size: string;
    references: number;
    outcome: keyof ImageCounts;
  },
) {
  console.log(JSON.stringify({ aiUsage: "image", ...details }));
  await add(uid, {
    images: { [details.quality]: { [details.outcome]: inc(1) } },
  });
}
