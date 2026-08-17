import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import stylistic from "@stylistic/eslint-plugin";
import { defineConfig } from "eslint/config";

export default defineConfig([
  { ignores: ["site/**"] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked, // Heavily opinionated safety rules
  ...tseslint.configs.stylisticTypeChecked,
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
    plugins: { js, "@stylistic": stylistic },
    extends: ["js/recommended"],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        // Enforce typescript-eslint to dynamically locate your tsconfig files
        projectService: {
          allowDefaultProject: ["eslint.config.mts"],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true },
      ],
      // Bun instruments an implicit constructor for field-initialized classes
      // but does not mark that synthetic function as covered.
      "@typescript-eslint/no-useless-constructor": "off",
      "@typescript-eslint/no-empty-function": [
        "error",
        { allow: ["constructors"] },
      ],
      curly: ["error", "all"],
      "max-lines-per-function": [
        "error",
        {
          max: 10,
          skipBlankLines: true,
          skipComments: true,
          IIFEs: true,
        },
      ],
      "@stylistic/max-len": [
        "error",
        {
          code: 80,
          tabWidth: 2,
          ignoreUrls: true,
          ignoreStrings: true,
          ignoreTemplateLiterals: true,
        },
      ],
      "max-lines": [
        "error",
        {
          max: 100,
          skipBlankLines: true,
          skipComments: true,
        },
      ],
      "max-params": ["error", 4],
      "max-classes-per-file": ["error", 1],
    },
  },
  {
    files: ["test/**/*.ts"],
    rules: {
      // Bun's matcher declarations type async matchers as void even though
      // awaiting `.rejects` is required for correct test execution. Test
      // doubles also intentionally implement async production interfaces
      // without needing an internal await.
      "@typescript-eslint/await-thenable": "off",
      "@typescript-eslint/no-confusing-void-expression": "off",
      "@typescript-eslint/require-await": "off",
      "max-lines-per-function": [
        "error",
        {
          max: 40,
          skipBlankLines: true,
          skipComments: true,
          IIFEs: true,
        },
      ],
      "max-lines": [
        "error",
        {
          max: 200,
          skipBlankLines: true,
          skipComments: true,
        },
      ],
    },
  },
  tseslint.configs.recommended,
]);
