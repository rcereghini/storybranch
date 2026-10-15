import { it, expect } from "vitest";
import { backendConfig } from "../services/api/config";
import { firebaseConfig } from "../fixtures/firebase-config";

it("uses the requested shared project and its bucket", () => {
  const config = backendConfig({});
  expect(config.mode).toBe("firebase");
  expect(config.projectId).toBe(firebaseConfig.projectId);
  expect(config.bucket).toBe("storybranch-f77a3.firebasestorage.app");
});
it("requires explicit emulator mode and keeps it on demo projects", () => {
  const config = backendConfig({ STORYBRANCH_MODE: "emulator" });
  expect(config.projectId).toBe("demo-storybranch");
  expect(
    backendConfig({
      STORYBRANCH_MODE: "emulator",
      STORYBRANCH_PHONE_PREVIEW: "1",
    }).projectId,
  ).toBe("demo-storybranch-phone");
});
it.each([
  { FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080" },
  { FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099" },
  { FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9299" },
  {
    STORYBRANCH_MODE: "emulator",
    FIREBASE_STORAGE_EMULATOR_HOST: "remote.example:9299",
  },
  { STORYBRANCH_PHONE_PREVIEW: "1" },
  { STORYBRANCH_MODE: "other" },
  {
    STORYBRANCH_MODE: "emulator",
    FIRESTORE_EMULATOR_HOST: "remote.example:8080",
  },
])("rejects mixed or invalid configuration %j", (env) => {
  expect(() => backendConfig(env)).toThrow();
});
