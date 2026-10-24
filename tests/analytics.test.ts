import { describe, expect, it } from "vitest";
import { analyticsUrl } from "../apps/web/src/analytics";

describe("Web Analytics URLs", () => {
  it("hides private IDs and drops query strings and hashes", () => {
    const site = "https://www.storybranch.com";
    expect(analyticsUrl(`${site}/play/save-123`)).toBe(`${site}/play/[saveId]`);
    expect(analyticsUrl(`${site}/assets/edit/asset-9?x=1#top`)).toBe(
      `${site}/assets/edit/[assetId]`,
    );
    expect(analyticsUrl(`${site}/s/glass-harbor?ref=share`)).toBe(
      `${site}/s/glass-harbor`,
    );
    expect(analyticsUrl(`${site}/story-nodes/abc/2`)).toBe(
      `${site}/story-nodes/abc/2`,
    );
    expect(analyticsUrl(`${site}/players`)).toBe(`${site}/players`);
  });
});
