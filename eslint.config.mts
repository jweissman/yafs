import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import { defineConfig } from "eslint/config";

export default defineConfig([
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts}"], plugins: { js }, extends: ["js/recommended"], languageOptions: { globals: globals.browser },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
      "max-lines-per-function": [
        "error",
        {
          "max": 8,
          "skipBlankLines": true,
          "skipComments": true,
          "IIFEs": true
        }
      ]
    }
  },
  tseslint.configs.recommended,
]);
