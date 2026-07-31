import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import stylistic from '@stylistic/eslint-plugin'
import { defineConfig } from "eslint/config";


export default defineConfig([
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
    plugins: { js, '@stylistic': stylistic },
    extends: ["js/recommended"], languageOptions: { globals: globals.browser },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
      "max-lines-per-function": [
        "error",
        {
          "max": 5,
          "skipBlankLines": true,
          "skipComments": true,
          "IIFEs": true
        }
      ],
      '@stylistic/max-len': ['error', {
        code: 120,
        tabWidth: 2,
        ignoreUrls: true,
        ignoreStrings: true,
        ignoreTemplateLiterals: true
      }]
    }
  },
  tseslint.configs.recommended,
]);
