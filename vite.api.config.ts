import { defineConfig } from "vite";
// Bundles the API for Vercel, whose per-file TypeScript compile cannot resolve
// this project's extensionless ESM imports. npm dependencies stay external.
export default defineConfig({
  build: {
    ssr: "services/vercel/api.ts",
    outDir: "dist-api",
    emptyOutDir: true,
    target: "node22",
  },
});
