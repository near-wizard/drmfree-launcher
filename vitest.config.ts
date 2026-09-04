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
    // Vitest's default exclude list doesn't know about
    // .claude/worktrees/ (nested git worktrees live inside the repo
    // tree) — without this, running a test from the main checkout
    // while a worktree session is active picks up that worktree's own
    // test files too, roughly doubling the reported count and
    // attributing another branch's failures to this one. Found live:
    // a concurrent mod-manager worktree session doubled 31 files/232
    // tests to 62/471.
    exclude: ["**/node_modules/**", "**/dist/**", "**/.claude/worktrees/**"],
  },
});
