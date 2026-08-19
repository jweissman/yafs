import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import stylistic from "@stylistic/eslint-plugin";
import { defineConfig } from "eslint/config";
import noComments from "eslint-plugin-no-comments";

export default defineConfig([
  { ignores: ["site/**"] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    plugins: { js, "@stylistic": stylistic, "no-comments": noComments },
    extends: ["js/recommended"],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
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

      "@typescript-eslint/no-useless-constructor": "off",
      "@typescript-eslint/no-empty-function": [
        "error",
        { allow: ["constructors"] },
      ],
      curly: ["error", "all"],
      "max-lines-per-function": [
        "error",
        { max: 10, skipBlankLines: true, skipComments: true, IIFEs: true },
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
      "no-console": "error",
      "no-comments/disallowComments": "error",
    },
  },
  {
    files: ["test/**/*.ts"],
    rules: {
      "@typescript-eslint/await-thenable": "off",
      "@typescript-eslint/no-confusing-void-expression": "off",
      "@typescript-eslint/require-await": "off",
      "max-lines-per-function": [
        "error",
        { max: 40, skipBlankLines: true, skipComments: true, IIFEs: true },
      ],
      "max-lines": [
        "error",
        { max: 350, skipBlankLines: true, skipComments: true },
      ],
    },
  },
  {
    files: ["src/yash/**/*.ts", "src/yash.ts", "src/yafsd.ts"],
    rules: { "no-console": "off" },
  },
  {
    files: ["script/**/*.ts"],
    rules: {
      "no-console": "off",
      "max-lines-per-function": ["error", { max: 60, IIFEs: true }],
    },
  },
  tseslint.configs.recommended,
]);
