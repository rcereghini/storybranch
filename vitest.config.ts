import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    root: ".",
    testTimeout: 20000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
