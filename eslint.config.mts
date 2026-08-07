import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import stylistic from "@stylistic/eslint-plugin";
import { defineConfig } from "eslint/config";

export default defineConfig([
  { ignores: ["site/**"] },
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
    plugins: { js, "@stylistic": stylistic },
    extends: ["js/recommended"],
    languageOptions: { globals: globals.browser },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
      curly: ["error", "all"],
      "max-lines-per-function": [
        "error",
        {
          max: 15,
          skipBlankLines: true,
          skipComments: true,
          IIFEs: true,
        },
      ],
      "@stylistic/max-len": [
        "error",
        {
          code: 120,
          tabWidth: 2,
          ignoreUrls: true,
          ignoreStrings: true,
          ignoreTemplateLiterals: true,
        },
      ],
      "max-lines": [
        "error",
        {
          max: 160,
          skipBlankLines: true,
          skipComments: true,
        },
      ],
    },
  },
  {
    files: ["test/**/*.test.ts"],
    rules: {
      "max-lines-per-function": [
        "error",
        {
          max: 30,
          skipBlankLines: true,
          skipComments: true,
          IIFEs: true,
        },
      ],
    },
  },
  tseslint.configs.recommended,
]);
