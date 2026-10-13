import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
export const auth = getAuth(
  initializeApp({
    apiKey: "local-demo-key",
    projectId:
      import.meta.env.VITE_PHONE_PREVIEW === "1"
        ? "demo-storybranch-phone"
        : "demo-storybranch",
    authDomain: "demo-storybranch.firebaseapp.com",
  }),
);
connectAuthEmulator(
  auth,
  import.meta.env.VITE_PHONE_PREVIEW === "1"
    ? location.origin
    : "http://127.0.0.1:9099",
  { disableWarnings: true },
);
