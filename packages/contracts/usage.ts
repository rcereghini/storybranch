import type { imageQualities } from "./generation";

// Daily AI usage totals, kept so the admin dashboard can show spend without
// reading logs. One record per UTC day, and one per user per day.
export type ImageQuality = (typeof imageQualities)[number];
export type ClaudeFeature = "copilot" | "assist";
export type ClaudeTokens = {
  requests: number;
  inputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  outputTokens: number;
  refusals: number;
};
// returned: the provider sent an image (billed); refused: not billed;
// uncertain: may have been billed.
export type ImageCounts = {
  returned: number;
  refused: number;
  uncertain: number;
};
export type AiUsage = {
  // Feature, then model ID: a declined request retried on a fallback model
  // is billed at that model's rates.
  claude: Partial<Record<ClaudeFeature, Record<string, Partial<ClaudeTokens>>>>;
  images: Partial<Record<ImageQuality, Partial<ImageCounts>>>;
};
export type AiUsageDay = AiUsage & { day: string };

// USD list prices used for estimates. The real bill is in the Anthropic and
// OpenAI consoles. Claude rates are per million tokens, from Anthropic's
// published pricing (checked 2026-10-06); 5-minute cache writes bill at 1.25x
// input. Image prices are unset until an admin enters them, so images are
// counted but not priced.
export type AiPrices = {
  claude: Record<
    string,
    {
      input: number;
      output: number;
      cacheRead: number;
      cacheWrite: number;
    }
  >;
  images: Record<ImageQuality, number | null>;
};
export const defaultAiPrices: AiPrices = {
  claude: {
    "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  },
  images: { draft: null, high: null },
};

export type AiUsageTotals = {
  claudeRequests: number;
  refusals: number;
  images: number;
  // Estimated USD for priced usage only.
  estimatedUsd: number;
  // Requests whose model or image tier has no price, so the estimate is low.
  unpricedRequests: number;
};
export type AiUsageUser = AiUsageTotals & {
  uid: string;
  email: string | null;
  displayName: string;
};
export type AiUsageReport = {
  from: string;
  to: string;
  days: Array<AiUsageDay & { totals: AiUsageTotals }>;
  totals: AiUsageTotals;
  byFeature: Record<ClaudeFeature | "image", AiUsageTotals>;
  topUsers: AiUsageUser[];
  prices: AiPrices;
};
export const usageReportDays = [7, 30, 90] as const;
