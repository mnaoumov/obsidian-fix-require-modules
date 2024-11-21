declare module '@babel/plugin-transform-modules-commonjs' {
  import type { PluginItem } from '@babel/core';

  const pluginItem: PluginItem;
  // eslint-disable-next-line import-x/no-default-export
  export default pluginItem;
}

declare module '@babel/preset-typescript' {
  import type { PluginItem } from '@babel/core';

  const preset: PluginItem[];
  // eslint-disable-next-line import-x/no-default-export
  export default preset;
}
