process.env.STORYBRANCH_PHONE_PREVIEW = "1";
process.env.STORYBRANCH_MODE = "emulator";
const command = process.argv[2];
if (command === "build") {
  process.env.VITE_PHONE_PREVIEW = "1";
  const { build } = await import("vite");
  await build({ build: { outDir: "../../dist-phone" } });
} else if (command === "emulators") await import("./emulators");
else if (command === "seed") await import("./seed");
else if (command === "serve") await import("./phone-preview");
else throw new Error("Use build, emulators, seed or serve");
export {};
