/* eslint-env node */
module.exports = {
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended", "prettier"],
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint", "import", "modules-newlines", "@stylistic/eslint-plugin"],
  root: true,
  rules: {
    // turn on errors for missing imports
    "import/no-unresolved": "error",
    "import/no-namespace": "error",
    "modules-newlines/import-declaration-newline": "error",
    "modules-newlines/export-declaration-newline": "error",
    "@typescript-eslint/explicit-function-return-type": "error",
    "@stylistic/indent": ["error", 2],
    "quotes": ["error", "double"]
  },
  settings: {
    "import/parsers": {
      "@typescript-eslint/parser": [".ts", ".tsx"]
    },
    "import/resolver": {
      "typescript": {
        "alwaysTryTypes": true, // always try to resolve types under `<root>@types` directory even it doesn't contain any source code, like `@types/unist`
      }
    }
  },
  env: {
    browser: true,
    node: true
  },
  overrides: [{
      files: ["*.mjs", "*.js"],
      rules: {
        "@typescript-eslint/explicit-function-return-type": "off",
        "@typescript-eslint/no-unused-vars": "off"
      }
    }
  ]
};
