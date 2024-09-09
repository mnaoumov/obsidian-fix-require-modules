declare module '@babel/plugin-transform-modules-commonjs' {
  import type { PluginItem } from '@babel/core';

  const pluginItem: PluginItem;
  export default pluginItem;
}

declare module '@babel/preset-typescript' {
  import type { PluginItem } from '@babel/core';

  const preset: PluginItem[];
  export default preset;
}
