import { existsSync, readdirSync } from "node:fs";
import { resolve, delimiter } from "node:path";
import { spawn } from "node:child_process";
// Prefer installed Java; the workspace runtime is a convenience on this machine.
if (!process.env.JAVA_HOME && existsSync(".tools/java")) {
  const dir = readdirSync(".tools/java").find((x) => x.startsWith("jdk"));
  if (dir)
    process.env.PATH =
      resolve(".tools/java", dir, "bin") + delimiter + process.env.PATH;
}
const child = spawn(
  process.execPath,
  [
    "node_modules/firebase-tools/lib/bin/firebase.js",
    "emulators:start",
    ...(process.env.STORYBRANCH_PHONE_PREVIEW === "1"
      ? ["--config", "firebase.phone.json"]
      : []),
    "--project",
    process.env.STORYBRANCH_PHONE_PREVIEW === "1"
      ? "demo-storybranch-phone"
      : "demo-storybranch",
    "--only",
    "auth,firestore",
    ...(process.env.STORYBRANCH_PHONE_PREVIEW === "1"
      ? []
      : existsSync(".emulator-data/firebase-export-metadata.json")
        ? ["--import=.emulator-data"]
        : []),
    ...(process.env.STORYBRANCH_PHONE_PREVIEW === "1"
      ? []
      : ["--export-on-exit=.emulator-data"]),
  ],
  { stdio: "inherit", env: process.env },
);
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
