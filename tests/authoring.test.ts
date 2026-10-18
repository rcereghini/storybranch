import { it, expect } from "vitest";
import { validatePublication } from "../packages/domain/authoring";
import { draftSchema } from "../packages/contracts/authoring";
import type { Story } from "../packages/contracts/index";
import {
  accountFeatures,
  allFeatures,
  profileUpdateSchema,
  storedFeatures,
} from "../packages/contracts/profile";
it("grants a feature only when the profile flag is exactly true", () => {
  const none = { publish: false, generate: false, copilot: false, admin: false };
  expect(accountFeatures(undefined)).toEqual(none);
  expect(accountFeatures({})).toEqual(none);
  expect(accountFeatures({ features: "publish" })).toEqual(none);
  expect(
    accountFeatures({
      features: { publish: "true", generate: 1, copilot: null, admin: "yes", root: true },
    }),
  ).toEqual(none);
  expect(accountFeatures({ features: { publish: true } })).toEqual({
    ...none,
    publish: true,
  });
  expect(accountFeatures({ features: allFeatures })).toEqual(allFeatures);
});
it("gives admins every feature while keeping their stored flags as set", () => {
  const admin = { features: { admin: true, copilot: false } };
  expect(accountFeatures(admin)).toEqual(allFeatures);
  expect(storedFeatures(admin)).toEqual({
    publish: false,
    generate: false,
    copilot: false,
    admin: true,
  });
});
it("never lets a player set their own feature flags", () => {
  expect(
    profileUpdateSchema.safeParse({
      displayName: "Ada",
      avatarId: "lantern",
      features: allFeatures,
    }).success,
  ).toBe(false);
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
