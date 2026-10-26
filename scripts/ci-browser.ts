import { spawn } from "node:child_process";
const server = spawn(process.execPath, ["--import", "tsx", "scripts/dev.ts"], {
  stdio: "inherit",
  env: {
    ...process.env,
    STORYBRANCH_MODE: "emulator",
    VITE_STORYBRANCH_MODE: "emulator",
  },
});
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch("http://127.0.0.1:5173")).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  if (!ready) throw new Error("Web server did not start.");
  await import("./browser-check");
  await import("./d20-check");
  await import("./copilot-check");
  await import("./admin-check");
  await import("./email-check");
  await import("./story-trunk-check");
  await import("./key-imports-check");
  await import("./preview-keys-check");
  await import("./key-conditions-check");
  await import("./item-effects-check");
  await import("./saved-scenarios-check");
  await import("./promotional-keys-check");
  await import("./earned-account-keys-check");
} finally {
  server.kill();
}
