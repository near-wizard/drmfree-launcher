import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Separate from vite.config.ts on purpose: that file's dev-server
// options (fixed port, Tauri host/HMR wiring) are meaningless for a
// test run and would just add noise/failure modes to `vitest`.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
});
