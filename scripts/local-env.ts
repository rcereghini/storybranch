process.env.STORYBRANCH_MODE = "emulator";
process.env.FIRESTORE_EMULATOR_HOST =
  process.env.STORYBRANCH_PHONE_PREVIEW === "1"
    ? "127.0.0.1:8180"
    : "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST =
  process.env.STORYBRANCH_PHONE_PREVIEW === "1"
    ? "127.0.0.1:9199"
    : "127.0.0.1:9099";
