import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// Renderer is served/bundled separately from the Electron main process.
// base: "./" is required so the built index.html works when loaded via
// file:// from Electron in production.
export default defineConfig({
  plugins: [react()],
  base: "./",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src")
    }
  },
  build: {
    outDir: "dist",
    emptyOutDir: true
  },
  server: {
    port: 5173,
    strictPort: true
  }
});
