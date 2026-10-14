import { it, expect } from "vitest";
import { validatePublication } from "../packages/domain/authoring";
import { draftSchema } from "../packages/contracts/authoring";
import type { Story } from "../packages/contracts/index";
import { publisherAllowed } from "../services/api/creator-access";
it("requires an explicit Firebase publisher allowlist while enabling emulator authors", () => {
  expect(publisherAllowed("firebase", "creator")).toBe(false);
  expect(publisherAllowed("firebase", "creator", "other, creator ")).toBe(true);
  expect(publisherAllowed("firebase", "creator", "creator2")).toBe(false);
  expect(publisherAllowed("emulator", "creator")).toBe(true);
});
export const draftStory = (id = "test-story"): Story => ({
  id,
  title: "Test story",
  versionId: "draft",
  rulesetVersion: "prototype-1",
  entryPageId: "opening",
  pages: {
    opening: {
      id: "opening",
      title: "Opening",
      pageType: "text",
      kind: "scene",
      transcript: "A new journey.",
      entryEffects: [],
      choices: [
        {
          id: "next",
          label: "Next",
          costs: [],
          unavailableDisplay: "locked",
          outcome: {
            kind: "direct",
            route: { targetPageId: "ending", effects: [] },
          },
        },
      ],
    },
    ending: {
      id: "ending",
      title: "Ending",
      pageType: "text",
      kind: "ending",
      transcript: "Home again.",
      entryEffects: [],
      choices: [],
    },
  },
});
it("publishes a connected graph and rejects missing, unreachable and trapped routes", () => {
  expect(validatePublication(draftStory()).title).toBe("Test story");
  const missing = draftStory();
  delete missing.pages.ending;
  expect(() => validatePublication(missing)).toThrow("Dangling route");
  const unused = draftStory();
  unused.pages.unused = { ...unused.pages.ending, id: "unused" };
  expect(() => validatePublication(unused)).toThrow("unreachable");
  const trapped = draftStory();
  trapped.pages.opening.pageType = "text-options";
  trapped.pages.opening.choices.push({
    ...trapped.pages.opening.choices[0],
    id: "loop",
    outcome: { kind: "direct", route: { targetPageId: "loop", effects: [] } },
  });
  trapped.pages.loop = {
    ...trapped.pages.opening,
    id: "loop",
    choices: [trapped.pages.opening.choices[1]],
  };
  expect(() => validatePublication(trapped)).toThrow(
    "Add a route to an ending",
  );
});
it("allows incomplete private drafts while bounding authoring payloads", () => {
  const story = draftStory();
  delete story.pages.ending;
  expect(draftSchema.safeParse({ story, description: "" }).success).toBe(true);
  expect(
    draftSchema.safeParse({ story, description: "x".repeat(501) }).success,
  ).toBe(false);
});
