import type {
  AiPrices,
  AiUsage,
  AiUsageTotals,
  ClaudeFeature,
  ClaudeTokens,
  ImageQuality,
} from "../contracts/usage";

export const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);
// The UTC days ending with `to`, oldest first.
export function dayRange(to: number, count: number) {
  return Array.from({ length: count }, (_, i) =>
    dayKey(to - (count - 1 - i) * 86400000),
  );
}

export const emptyTotals = (): AiUsageTotals => ({
  claudeRequests: 0,
  refusals: 0,
  images: 0,
  estimatedUsd: 0,
  unpricedRequests: 0,
});

const n = (value: unknown) => (typeof value === "number" ? value : 0);

// Totals for one feature, or every feature when none is given.
export function usageTotals(
  usage: AiUsage,
  prices: AiPrices,
  feature?: ClaudeFeature | "image",
): AiUsageTotals {
  const totals = emptyTotals();
  for (const [name, models] of Object.entries(usage.claude ?? {})) {
    if (feature && feature !== name) continue;
    for (const [model, tokens] of Object.entries(models ?? {})) {
      const t = tokens as Partial<ClaudeTokens>;
      totals.claudeRequests += n(t.requests);
      totals.refusals += n(t.refusals);
      const price = prices.claude[model];
      if (!price) {
        totals.unpricedRequests += n(t.requests);
        continue;
      }
      totals.estimatedUsd +=
        (n(t.inputTokens) * price.input +
          n(t.outputTokens) * price.output +
          n(t.cacheReadTokens) * price.cacheRead +
          n(t.cacheWriteTokens) * price.cacheWrite) /
        1e6;
    }
  }
  if (!feature || feature === "image")
    for (const [quality, counts] of Object.entries(usage.images ?? {})) {
      totals.images += n(counts?.returned);
      // An uncertain request may have been billed, so it is priced too.
      const billed = n(counts?.returned) + n(counts?.uncertain);
      const price = prices.images[quality as ImageQuality];
      if (price == null) totals.unpricedRequests += billed;
      else totals.estimatedUsd += billed * price;
    }
  return totals;
}

export function addTotals(a: AiUsageTotals, b: AiUsageTotals): AiUsageTotals {
  return {
    claudeRequests: a.claudeRequests + b.claudeRequests,
    refusals: a.refusals + b.refusals,
    images: a.images + b.images,
    estimatedUsd: a.estimatedUsd + b.estimatedUsd,
    unpricedRequests: a.unpricedRequests + b.unpricedRequests,
  };
}
