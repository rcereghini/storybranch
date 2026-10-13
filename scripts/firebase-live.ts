import { existsSync } from "node:fs";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
process.env.STORYBRANCH_MODE = "firebase";
await import("./seed");
export {};
