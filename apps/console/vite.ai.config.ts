import { defineConfig } from "vite";

// The voice page at https://ai.platformontology.lol, built apart from the console.
export default defineConfig({
  base: "/ai/",
  publicDir: false,
  build: { outDir: "dist-ai", emptyOutDir: true, rollupOptions: { input: "ai.html" }, chunkSizeWarningLimit: 900 },
});
