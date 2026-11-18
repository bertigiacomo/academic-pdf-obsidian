// eslint.config.mjs
import { defineConfig, globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  globalIgnores(["node_modules", "main.js", "esbuild.config.mjs", "vitest.config.ts", "scripts", "mockups", "fixtures", "docs"]),
  ...obsidianmd.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["eslint.config.*"],
        },
      },
    },
  },
  {
    // Tests build their DOM fixtures from HTML literals and poke at private
    // state. They never ship, and the community scanner does not lint them.
    files: ["**/*.test.ts", "src/__mocks__/**", "src/academic/__tests__/**"],
    rules: {
      "no-unsanitized/property": "off",
      "@microsoft/sdl/no-inner-html": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/unbound-method": "off",
    },
  },
]);
