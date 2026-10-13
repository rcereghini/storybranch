import { defineConfig } from "vite";
export default defineConfig({
  root: "apps/web",
  server: { host: "127.0.0.1", proxy: { "/api": "http://127.0.0.1:3001" } },
  build: { outDir: "../../dist", emptyOutDir: true },
});
