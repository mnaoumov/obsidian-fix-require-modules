declare module "@babel/plugin-transform-modules-commonjs" {
  import type { PluginItem } from "@babel/core";
  let pluginItem: PluginItem;
  export default pluginItem;
}

declare module "@babel/preset-typescript" {
  import type { PluginItem } from "@babel/core";
  let preset: PluginItem[];
  export default preset;
}
