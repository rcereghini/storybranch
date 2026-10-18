import type { Features } from "../../packages/contracts/profile";

// An account's flags, limited to the services this deployment configures.
export const usableFeatures = (features: Features): Features => ({
  ...features,
  generate: features.generate && !!process.env.FAL_KEY,
  copilot: features.copilot && !!process.env.ANTHROPIC_API_KEY,
});
