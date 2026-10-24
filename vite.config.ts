import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  plugins: [tailwindcss()],
  root: "apps/web",
  server: { host: "127.0.0.1", proxy: { "/api": "http://127.0.0.1:3001" } },
  // Built files go in /static: the default /assets would shadow the app's
  // /assets StoryNode, because the host serves real folders before the app.
  build: { outDir: "../../dist", emptyOutDir: true, assetsDir: "static" },
});
