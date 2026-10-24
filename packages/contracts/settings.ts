import { z } from "zod";
import { id } from "./index";
import { copilotLimits } from "./copilot";
import { generationLimits } from "./generation";
import { defaultAiPrices, type AiPrices } from "./usage";

// App-wide settings admins change from the dashboard (settings/app). The
// server falls back to these defaults when nothing valid is stored, so a
// missing or broken record never takes the app down.
const dollars = z.number().min(0).max(1000);
const claudePrice = z
  .object({
    input: dollars,
    output: dollars,
    cacheRead: dollars,
    cacheWrite: dollars,
  })
  .strict();
export const appSettingsSchema = z
  .object({
    limits: z
      .object({
        // Copilot messages and Studio writing-help requests, together.
        aiRequestsPerDay: z.number().int().min(0).max(10000),
        imagesPerDay: z.number().int().min(0).max(10000),
      })
      .strict(),
    // Turning one off hides it in the app and refuses its requests.
    ai: z
      .object({
        copilot: z.boolean(),
        writingHelp: z.boolean(),
        imageGeneration: z.boolean(),
      })
      .strict(),
    // Feature flags a new live account starts with. Admin is never default.
    newAccounts: z
      .object({
        publish: z.boolean(),
        generate: z.boolean(),
        copilot: z.boolean(),
      })
      .strict(),
    // USD list prices used for spend estimates (not billing).
    prices: z
      .object({
        claude: z.record(z.string().min(1).max(80), claudePrice),
        images: z
          .object({ draft: dollars.nullable(), high: dollars.nullable() })
          .strict(),
      })
      .strict(),
  })
  .strict();
export type AppSettings = z.infer<typeof appSettingsSchema>;

export const defaultAppSettings: AppSettings = {
  limits: {
    aiRequestsPerDay: copilotLimits.dailyMessages,
    imagesPerDay: generationLimits.daily,
  },
  ai: { copilot: true, writingHelp: true, imageGeneration: true },
  newAccounts: { publish: false, generate: false, copilot: false },
  prices: defaultAiPrices satisfies AiPrices,
};

export const adminSettingsCommandSchema = z
  .object({
    idempotencyKey: id,
    expectedRevision: z.number().int().min(0),
    settings: appSettingsSchema,
  })
  .strict();
export type AdminSettings = {
  settings: AppSettings;
  defaults: AppSettings;
  revision: number;
  updatedAt: number | null;
  updatedBy: string | null;
};

// Changed values as "path: before → after", for the audit log.
export function settingsChanges(before: AppSettings, after: AppSettings) {
  const flat = (value: unknown, path = ""): Array<[string, unknown]> =>
    value && typeof value === "object"
      ? Object.entries(value).flatMap(([key, v]) =>
          flat(v, path ? `${path}.${key}` : key),
        )
      : [[path, value]];
  const old = new Map(flat(before));
  const now = new Map(flat(after));
  return [...new Set([...old.keys(), ...now.keys()])]
    .filter((path) => old.get(path) !== now.get(path))
    .sort()
    .map((path) => ({
      path,
      before: old.get(path) ?? null,
      after: now.get(path) ?? null,
    }));
}

// A person's own daily limits, set by an admin on their profile; null (or
// missing) means the default in Settings.
export const accountLimitsSchema = z
  .object({
    aiRequestsPerDay: z.number().int().min(0).max(10000).nullable(),
    imagesPerDay: z.number().int().min(0).max(10000).nullable(),
  })
  .strict();
export type AccountLimits = z.infer<typeof accountLimitsSchema>;
export const noAccountLimits: AccountLimits = {
  aiRequestsPerDay: null,
  imagesPerDay: null,
};
export const storedAccountLimits = (data: { limits?: unknown } | undefined) => {
  const parsed = accountLimitsSchema.safeParse(data?.limits);
  return parsed.success ? parsed.data : noAccountLimits;
};
export const effectiveLimits = (
  data: { limits?: unknown } | undefined,
  settings: AppSettings,
): AppSettings["limits"] => {
  const own = storedAccountLimits(data);
  return {
    aiRequestsPerDay: own.aiRequestsPerDay ?? settings.limits.aiRequestsPerDay,
    imagesPerDay: own.imagesPerDay ?? settings.limits.imagesPerDay,
  };
};
