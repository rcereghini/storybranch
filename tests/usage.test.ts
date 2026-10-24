import { describe, expect, it } from "vitest";
import { defaultAiPrices, type AiPrices } from "../packages/contracts/usage";
import {
  addTotals,
  dayRange,
  emptyTotals,
  usageTotals,
} from "../packages/domain/usage";

const usage = {
  claude: {
    copilot: {
      "claude-opus-5-5": {
        requests: 2,
        inputTokens: 1_000_000,
        outputTokens: 100_000,
        cacheReadTokens: 2_000_000,
        cacheWriteTokens: 200_000,
        refusals: 1,
      },
      // A fallback model with no price: counted, not priced.
      "claude-other": { requests: 1, inputTokens: 500 },
    },
    assist: { "claude-opus-5-5": { requests: 1, outputTokens: 50_000 } },
  },
  images: {
    draft: { returned: 3, refused: 2 },
    high: { returned: 1, uncertain: 1 },
  },
};

describe("AI usage estimates", () => {
  it("prices Claude tokens per model and counts what it cannot price", () => {
    // 1M input $4 + 0.1M output $2 + 2M cache reads $0.40 + 0.2M writes $1.
    expect(
      usageTotals(usage, defaultAiPrices, "copilot").estimatedUsd,
    ).toBeCloseTo(7.4);
    expect(usageTotals(usage, defaultAiPrices, "copilot")).toMatchObject({
      claudeRequests: 3,
      refusals: 1,
      unpricedRequests: 1,
      images: 0,
    });
    expect(usageTotals(usage, defaultAiPrices, "assist").estimatedUsd).toBe(1);
  });

  it("counts images without prices, and prices returned and uncertain ones once set", () => {
    expect(usageTotals(usage, defaultAiPrices, "image")).toEqual({
      ...emptyTotals(),
      images: 4,
      unpricedRequests: 5,
    });
    const priced: AiPrices = {
      ...defaultAiPrices,
      images: { draft: 0.01, high: 0.2 },
    };
    // 3 draft + (1 returned + 1 uncertain) high; refusals are free.
    expect(usageTotals(usage, priced, "image").estimatedUsd).toBeCloseTo(0.43);
    const all = usageTotals(usage, priced);
    expect(all.estimatedUsd).toBeCloseTo(7.4 + 1 + 0.43);
    expect(addTotals(all, all).claudeRequests).toBe(8);
  });

  it("lists UTC days oldest first", () => {
    expect(dayRange(Date.UTC(2026, 2, 1, 12), 3)).toEqual([
      "2026-02-27",
      "2026-02-28",
      "2026-03-01",
    ]);
  });
});
