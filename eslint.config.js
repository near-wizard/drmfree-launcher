import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { globalIgnores } from "eslint/config";

export default tseslint.config([
  globalIgnores(["dist", "src-tauri", ".claude/worktrees"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat["recommended-latest"],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // This rule targets React Compiler's assumptions; this project
      // doesn't use the compiler, and fetch-on-mount /
      // fetch-when-a-dependency-changes is the standard (and correct)
      // pattern used throughout this app's data loading.
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);
