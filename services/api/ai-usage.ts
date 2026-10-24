import type Anthropic from "@anthropic-ai/sdk";

// One JSON log line per paid AI call, so spend per feature can be read from
// Vercel's logs. Token counts only: never prompts, replies or user IDs.
export function logClaudeUsage(
  feature: "copilot" | "assist",
  message: Pick<
    Anthropic.Beta.Messages.BetaMessage,
    "model" | "stop_reason" | "usage"
  >,
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
      // A refusal retried on another model is billed per step.
      ...(usage.iterations?.length ? { iterations: usage.iterations } : {}),
    }),
  );
}

export function logImageUsage(details: {
  quality: string;
  size: string;
  references: number;
  // returned: the provider sent an image (billed); refused: not billed.
  outcome: "returned" | "refused" | "uncertain";
}) {
  console.log(JSON.stringify({ aiUsage: "image", ...details }));
}
