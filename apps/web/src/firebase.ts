import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { firebaseConfig } from "../../../fixtures/firebase-config";
export const emulatorMode =
  import.meta.env.VITE_STORYBRANCH_MODE === "emulator" ||
  import.meta.env.VITE_PHONE_PREVIEW === "1";
export const auth = getAuth(
  initializeApp(
    emulatorMode
      ? {
          apiKey: "local-demo-key",
          projectId:
            import.meta.env.VITE_PHONE_PREVIEW === "1"
              ? "demo-storybranch-phone"
              : "demo-storybranch",
          authDomain: "demo-storybranch.firebaseapp.com",
        }
      : firebaseConfig,
  ),
);
if (emulatorMode)
  connectAuthEmulator(
    auth,
    import.meta.env.VITE_PHONE_PREVIEW === "1"
      ? location.origin
      : "http://127.0.0.1:9099",
    { disableWarnings: true },
  );
