import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import type { FirebaseStorage } from "firebase/storage";
import {
  firebaseConfig,
  ownAuthDomain,
} from "../../../fixtures/firebase-config";
export const emulatorMode =
  import.meta.env.VITE_STORYBRANCH_MODE === "emulator" ||
  import.meta.env.VITE_PHONE_PREVIEW === "1";
const app = initializeApp(
  emulatorMode
    ? {
        apiKey: "local-demo-key",
        projectId:
          import.meta.env.VITE_PHONE_PREVIEW === "1"
            ? "demo-storybranch-phone"
            : "demo-storybranch",
        authDomain: "demo-storybranch.firebaseapp.com",
      }
    : location.host === ownAuthDomain
      ? { ...firebaseConfig, authDomain: ownAuthDomain }
      : firebaseConfig,
);
export const auth = getAuth(app);
// Loaded on demand so only Studio pays for the Storage SDK.
let storage: Promise<FirebaseStorage> | undefined;
export function clipStorage() {
  storage ??= import("firebase/storage").then(
    ({ getStorage, connectStorageEmulator }) => {
      if (!emulatorMode) return getStorage(app);
      const local = getStorage(app, "gs://demo-storybranch.appspot.com");
      connectStorageEmulator(local, "127.0.0.1", 9299);
      return local;
    },
  );
  return storage;
}
if (emulatorMode)
  connectAuthEmulator(
    auth,
    import.meta.env.VITE_PHONE_PREVIEW === "1"
      ? location.origin
      : "http://127.0.0.1:9099",
    { disableWarnings: true },
  );
