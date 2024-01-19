declare module "@typescript-eslint/eslint-plugin" {
  import type {
    ESLint,
    Linter
  } from "eslint";

  type Config = {
    overrides: Config[];
    rules: Linter.RulesRecord;
  }

  const plugin: ESLint.Plugin & {
    configs: Record<string, Config>
  };
  export default plugin;
}

declare module "eslint-plugin-import" {
}

declare module "eslint-plugin-modules-newlines" {
}

declare module "globals" {
  const globals: {
    browser: object;
    node: object;
  };
  export default globals;
}
