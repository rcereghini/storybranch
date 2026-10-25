import { describe, expect, it } from "vitest";
import { attentionItems, commandMetrics } from "../packages/domain/command";
import { defaultAiPrices } from "../packages/contracts/usage";
import { dayRange } from "../packages/domain/usage";

const now = Date.UTC(2026, 9, 24, 12);
const day = 86400000;

describe("Command center numbers", () => {
  const usage = dayRange(now, 14).map((d, i) => ({
    day: d,
    claude:
      i === 13
        ? {
            copilot: {
              "claude-opus-5-5": { requests: 3, inputTokens: 1_000_000 },
            },
          }
        : i === 2
          ? { assist: { "claude-opus-5-5": { requests: 1 } } }
          : {},
    images: {},
  }));
  const m = commandMetrics({
    now,
    days: 7,
    accounts: [
      { createdAt: now - 1 * day, lastActiveAt: now - 3600000 },
      { createdAt: now - 2 * day, lastActiveAt: now - 10 * day },
      { createdAt: now - 9 * day, lastActiveAt: null },
      { createdAt: null, lastActiveAt: null },
    ],
    saves: [
      // One player finishing the same story twice counts once, at the latest.
      {
        playerUid: "a",
        storyId: "s",
        status: "completed",
        updatedAt: now - 3 * day,
      },
      {
        playerUid: "a",
        storyId: "s",
        status: "completed",
        updatedAt: now - 1 * day,
      },
      {
        playerUid: "b",
        storyId: "s",
        status: "completed",
        updatedAt: now - 8 * day,
      },
      { playerUid: "c", storyId: "s", status: "active", updatedAt: now },
    ],
    usage,
    prices: defaultAiPrices,
  });

  it("compares the period with the one before, day by day", () => {
    expect(m.signups).toEqual({
      value: 2,
      previous: 1,
      daily: [0, 0, 0, 0, 1, 1, 0],
    });
    expect(m.finishes).toMatchObject({ value: 1, previous: 1 });
    expect(m.aiRequests).toMatchObject({ value: 3, previous: 1 });
    expect(m.aiRequests.daily).toHaveLength(7);
    expect(m.aiSpend.value).toBeCloseTo(4);
    expect(m.aiSpend.previous).toBe(0);
  });

  it("counts active players without inventing an earlier figure", () => {
    expect(m.activePlayers).toEqual({
      value: 1,
      previous: null,
      daily: null,
      accounts: 4,
    });
  });
});

describe("Needs attention", () => {
  const none = {
    failedEmails: { count: 0, lastDetail: null },
    uncertainImages: 0,
    refusalsToday: 0,
    unpricedImages: 0,
    switchedOff: [],
    missing: [],
  };

  it("is empty when nothing needs a look", () => {
    expect(attentionItems(none)).toEqual([]);
  });

  it("lists urgent items first, each with the page that deals with it", () => {
    const items = attentionItems({
      failedEmails: {
        count: 2,
        lastDetail: "password-reset: SendGrid returned 403.",
      },
      uncertainImages: 1,
      refusalsToday: 4,
      unpricedImages: 12,
      switchedOff: ["Copilot"],
      missing: ["OpenAI"],
    });
    expect(items.map((i) => [i.id, i.severity])).toEqual([
      ["failed-emails", "critical"],
      ["missing-OpenAI", "critical"],
      ["uncertain-images", "warning"],
      ["refusals", "warning"],
      ["off-Copilot", "info"],
      ["image-prices", "info"],
    ]);
    expect(items[0]).toMatchObject({
      title: "2 emails failed to send in the last 24 hours",
      detail: "password-reset: SendGrid returned 403.",
      action: { path: "/admin/emails" },
    });
    expect(items[2].title).toBe("1 image job has an uncertain outcome");
    expect(items[5].detail).toContain("12 images");
    expect(items[1].action).toBeNull();
  });
});
