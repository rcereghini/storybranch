import {
  getApps,
  initializeApp,
  cert,
  applicationDefault,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { backendConfig } from "./config";
export const config = backendConfig(process.env);
let credential;
if (config.mode === "emulator") {
  process.env.FIRESTORE_EMULATOR_HOST = config.firestoreHost;
  process.env.FIREBASE_AUTH_EMULATOR_HOST = config.authHost;
  if (config.storageHost)
    process.env.FIREBASE_STORAGE_EMULATOR_HOST = config.storageHost;
} else if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  let account;
  try {
    account = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON must be valid JSON");
  }
  if (account.project_id !== config.projectId)
    throw new Error("Admin credential must belong to storybranch-f77a3");
  credential = cert(account);
} else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  credential = applicationDefault();
} else {
  throw new Error(
    "Configure FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS for storybranch-f77a3",
  );
}
const app =
  getApps().find((app) => app.name === config.projectId) ??
  initializeApp(
    { projectId: config.projectId, ...(credential ? { credential } : {}) },
    config.projectId,
  );
// Live and emulator use the same layout; see ./paths.
export const db = getFirestore(app);
export const auth = getAuth(app);
export const bucket = getStorage(app).bucket(config.bucket);
