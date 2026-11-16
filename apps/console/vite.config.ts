import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/console/",
  plugins: [react()],
  server: { port: 5181 },
  build: { outDir: "dist", chunkSizeWarningLimit: 900 },
});
