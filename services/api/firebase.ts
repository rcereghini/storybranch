import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
// Fail closed: this slice has no production credential mode.
if (process.env.STORYBRANCH_MODE !== "emulator")
  throw new Error(
    "Set STORYBRANCH_MODE=emulator. Production mode is not implemented.",
  );
const phonePreview = process.env.STORYBRANCH_PHONE_PREVIEW === "1";
for (const [key, value] of Object.entries({
  FIRESTORE_EMULATOR_HOST: phonePreview ? "127.0.0.1:8180" : "127.0.0.1:8080",
  FIREBASE_AUTH_EMULATOR_HOST: phonePreview
    ? "127.0.0.1:9199"
    : "127.0.0.1:9099",
})) {
  if (process.env[key] && process.env[key] !== value)
    throw new Error("Only loopback emulators are supported.");
  process.env[key] = value;
}
const app =
  getApps()[0] ??
  initializeApp({
    projectId: phonePreview ? "demo-storybranch-phone" : "demo-storybranch",
  });
export const db = getFirestore(app);
export const auth = getAuth(app);
