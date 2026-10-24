import {
  appSettingsSchema,
  defaultAppSettings,
  type AdminSettings,
  type AppSettings,
} from "../../packages/contracts/settings";
import { db } from "./firebase";

// settings/app, read through a short cache: another server instance sees a
// change within a minute. A missing or invalid record means the defaults.
export const settingsRef = () => db.doc("settings/app");
const ttl = 60000;
let cached: { at: number; value: AdminSettings } | null = null;

export function readSettings(data: Record<string, unknown> | undefined) {
  const parsed = appSettingsSchema.safeParse(data?.settings);
  if (data?.settings && !parsed.success)
    console.error("Stored settings are invalid; using defaults", parsed.error);
  return {
    settings: parsed.success ? parsed.data : defaultAppSettings,
    defaults: defaultAppSettings,
    revision: typeof data?.revision === "number" ? data.revision : 0,
    updatedAt: typeof data?.updatedAt === "number" ? data.updatedAt : null,
    updatedBy: typeof data?.updatedBy === "string" ? data.updatedBy : null,
  } satisfies AdminSettings;
}

export async function adminSettings(): Promise<AdminSettings> {
  if (cached && Date.now() - cached.at < ttl) return cached.value;
  try {
    const value = readSettings((await settingsRef().get()).data());
    cached = { at: Date.now(), value };
    return value;
  } catch (error) {
    // A read failure must not block requests; the defaults are safe.
    console.error("Settings could not be read; using defaults", error);
    return readSettings(undefined);
  }
}
export const appSettings = async (): Promise<AppSettings> =>
  (await adminSettings()).settings;
export const clearSettingsCache = () => {
  cached = null;
};
