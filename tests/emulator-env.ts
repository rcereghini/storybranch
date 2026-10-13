// Integration tests must never write to the live project, even in a live shell.
process.env.STORYBRANCH_MODE = "emulator";
delete process.env.STORYBRANCH_PHONE_PREVIEW;
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
export {};
