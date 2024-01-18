import {
  Plugin,
} from "obsidian";
import Module from "module";

type ModuleConstructor = typeof Module;

interface ModuleExConstructor extends ModuleConstructor {
  _pathCache: Record<string, string>;
  _cache: Record<string, Module>;
}

const builtInModuleNames = [
  "obsidian",
  "@codemirror/autocomplete",
  "@codemirror/collab",
  "@codemirror/commands",
  "@codemirror/language",
  "@codemirror/lint",
  "@codemirror/search",
  "@codemirror/state",
  "@codemirror/text",
  "@codemirror/view",
  "@lezer/common",
  "@lezer/lr",
  "@lezer/highlight"
];

export default class FixRequireModulesPlugin extends Plugin {
  public async onload(): Promise<void> {
    const pluginRequire = require;
    const nodeRequire = window.require;
    const electronRendererModule = window.module;
    const PATH_CACHE_SEPARATOR = "\x00";
    const pathCacheKeySuffix = ["", ...electronRendererModule.paths].join(PATH_CACHE_SEPARATOR);
    const ModuleEx = Module as ModuleExConstructor;

    for (const builtInModuleName of builtInModuleNames) {
      const builtInModule = pluginRequire(builtInModuleName);
      const pathCacheKey = `${builtInModuleName}${pathCacheKeySuffix}`;
      const fakePath = `${FixRequireModulesPlugin.name}/${builtInModuleName}`;
      ModuleEx._pathCache[pathCacheKey] = fakePath;
      const moduleWrapper = new ModuleEx(builtInModuleName);
      moduleWrapper.loaded = true;
      moduleWrapper.exports = builtInModule;
      ModuleEx._cache[fakePath] = moduleWrapper;

      this.register(() => {
        delete ModuleEx._pathCache[pathCacheKey];
        delete ModuleEx._cache[fakePath];
        delete nodeRequire.cache[builtInModuleName];
      });
    }
  }
}
