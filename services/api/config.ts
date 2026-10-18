export function backendConfig(env: Record<string, string | undefined>) {
  const mode = env.STORYBRANCH_MODE ?? "firebase";
  if (mode !== "firebase" && mode !== "emulator")
    throw new Error("Invalid STORYBRANCH_MODE");
  if (mode === "firebase") {
    if (
      env.FIRESTORE_EMULATOR_HOST ||
      env.FIREBASE_AUTH_EMULATOR_HOST ||
      env.FIREBASE_STORAGE_EMULATOR_HOST ||
      env.STORYBRANCH_PHONE_PREVIEW === "1"
    )
      throw new Error("Firebase mode cannot use emulator settings");
    return {
      mode,
      projectId: "storybranch-f77a3",
      firestoreHost: undefined,
      authHost: undefined,
      bucket: "storybranch-f77a3.firebasestorage.app",
      storageHost: undefined,
    } as const;
  }
  const phone = env.STORYBRANCH_PHONE_PREVIEW === "1";
  const firestoreHost = phone ? "127.0.0.1:8180" : "127.0.0.1:8080";
  const authHost = phone ? "127.0.0.1:9199" : "127.0.0.1:9099";
  if (
    (env.FIRESTORE_EMULATOR_HOST &&
      env.FIRESTORE_EMULATOR_HOST !== firestoreHost) ||
    (env.FIREBASE_AUTH_EMULATOR_HOST &&
      env.FIREBASE_AUTH_EMULATOR_HOST !== authHost) ||
    (env.FIREBASE_STORAGE_EMULATOR_HOST &&
      env.FIREBASE_STORAGE_EMULATOR_HOST !== "127.0.0.1:9299")
  )
    throw new Error("Only loopback emulators are supported");
  return {
    mode,
    projectId: phone ? "demo-storybranch-phone" : "demo-storybranch",
    firestoreHost,
    authHost,
    bucket: "demo-storybranch.appspot.com",
    // The phone preview runs without a Storage emulator, so it has no uploads.
    storageHost: phone ? undefined : "127.0.0.1:9299",
  } as const;
}
