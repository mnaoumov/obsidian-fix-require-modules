import { Plugin } from "obsidian";
import Module from "module";

export default class FixRequireModulesPlugin extends Plugin {
  public readonly builtInModuleNames = Object.freeze([
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
  ]);

  public override onload(): void {
    const pluginRequire = require;

    const originalRequire = Module.prototype.require;
    const newRequire = ((id: string): unknown => {
      if (this.builtInModuleNames.includes(id)) {
        return pluginRequire(id);
      }
      return originalRequire(id);
    }) as NodeJS.Require;

    Object.assign(newRequire, originalRequire);

    Module.prototype.require = newRequire;

    this.register(() => {
      Module.prototype.require = originalRequire;
    });
  }
}
