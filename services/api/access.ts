import {
  memberFeatures,
  type Features,
} from "../../packages/contracts/profile";
import type { AppSettings } from "../../packages/contracts/settings";

// An account's flags, limited to the services this deployment configures and
// the AI features an admin hasn't switched off.
export const usableFeatures = (
  features: Features,
  settings: AppSettings,
): Features => ({
  ...features,
  generate:
    features.generate &&
    !!process.env.OPENAI_API_KEY &&
    settings.ai.imageGeneration,
  copilot:
    features.copilot && !!process.env.ANTHROPIC_API_KEY && settings.ai.copilot,
});

// Studio writing help shares the copilot flag but has its own switch.
export const writingHelpUsable = (features: Features, settings: AppSettings) =>
  features.copilot &&
  !!process.env.ANTHROPIC_API_KEY &&
  settings.ai.writingHelp;

// The flags a new account starts with: every member feature locally, the
// admin-chosen defaults live, and never admin.
export const newAccountFeatures = (
  mode: "firebase" | "emulator",
  settings: AppSettings,
): Features =>
  mode === "emulator"
    ? memberFeatures
    : { ...settings.newAccounts, admin: false };
