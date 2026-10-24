import { afterEach, describe, expect, it } from "vitest";
import {
  appSettingsSchema,
  defaultAppSettings,
  settingsChanges,
  type AppSettings,
} from "../packages/contracts/settings";
import { allFeatures, memberFeatures } from "../packages/contracts/profile";
import {
  newAccountFeatures,
  usableFeatures,
  writingHelpUsable,
} from "../services/api/access";

const with_ = (change: (s: AppSettings) => void) => {
  const settings = structuredClone(defaultAppSettings);
  change(settings);
  return settings;
};

describe("App settings", () => {
  it("keeps today's behavior as the defaults and rejects bad values", () => {
    expect(appSettingsSchema.parse(defaultAppSettings)).toEqual(
      defaultAppSettings,
    );
    expect(defaultAppSettings.limits).toEqual({
      aiRequestsPerDay: 100,
      imagesPerDay: 100,
    });
    for (const bad of [
      with_((s) => (s.limits.aiRequestsPerDay = -1)),
      with_((s) => (s.limits.imagesPerDay = 1.5)),
      with_((s) => (s.prices.images.high = -0.1)),
      with_((s) => (s.prices.claude["claude-opus-5-5"].input = NaN)),
      {
        ...defaultAppSettings,
        newAccounts: { ...defaultAppSettings.newAccounts, admin: true },
      },
      { ...defaultAppSettings, extra: 1 },
    ])
      expect(appSettingsSchema.safeParse(bad).success).toBe(false);
  });

  it("lists exactly what changed, for the audit log", () => {
    expect(settingsChanges(defaultAppSettings, defaultAppSettings)).toEqual([]);
    expect(
      settingsChanges(
        defaultAppSettings,
        with_((s) => {
          s.ai.copilot = false;
          s.limits.imagesPerDay = 10;
          s.prices.images.draft = 0.01;
        }),
      ),
    ).toEqual([
      { path: "ai.copilot", before: true, after: false },
      { path: "limits.imagesPerDay", before: 100, after: 10 },
      { path: "prices.images.draft", before: null, after: 0.01 },
    ]);
  });
});

describe("Feature switches", () => {
  const keys = {
    openai: process.env.OPENAI_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
  };
  afterEach(() => {
    process.env.OPENAI_API_KEY = keys.openai;
    process.env.ANTHROPIC_API_KEY = keys.anthropic;
    if (keys.openai === undefined) delete process.env.OPENAI_API_KEY;
    if (keys.anthropic === undefined) delete process.env.ANTHROPIC_API_KEY;
  });

  it("hides an AI feature that is switched off, even from admins", () => {
    process.env.OPENAI_API_KEY = "test";
    process.env.ANTHROPIC_API_KEY = "test";
    expect(usableFeatures(allFeatures, defaultAppSettings)).toEqual(
      allFeatures,
    );
    const off = with_((s) => {
      s.ai.copilot = false;
      s.ai.imageGeneration = false;
    });
    expect(usableFeatures(allFeatures, off)).toMatchObject({
      copilot: false,
      generate: false,
      publish: true,
    });
    // Writing help has its own switch on the same account flag.
    expect(writingHelpUsable(allFeatures, off)).toBe(true);
    expect(
      writingHelpUsable(
        allFeatures,
        with_((s) => (s.ai.writingHelp = false)),
      ),
    ).toBe(false);
    expect(writingHelpUsable(memberFeatures, defaultAppSettings)).toBe(true);
    delete process.env.ANTHROPIC_API_KEY;
    expect(writingHelpUsable(allFeatures, defaultAppSettings)).toBe(false);
  });

  it("gives new live accounts the chosen defaults, never admin", () => {
    expect(newAccountFeatures("emulator", defaultAppSettings)).toEqual(
      memberFeatures,
    );
    expect(newAccountFeatures("firebase", defaultAppSettings)).toEqual({
      publish: false,
      generate: false,
      copilot: false,
      admin: false,
    });
    expect(
      newAccountFeatures(
        "firebase",
        with_((s) => (s.newAccounts.copilot = true)),
      ),
    ).toEqual({ publish: false, generate: false, copilot: true, admin: false });
  });
});
