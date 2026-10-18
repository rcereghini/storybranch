import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  plugins: [tailwindcss()],
  root: "apps/web",
  server: { host: "127.0.0.1", proxy: { "/api": "http://127.0.0.1:3001" } },
  build: { outDir: "../../dist", emptyOutDir: true },
});
