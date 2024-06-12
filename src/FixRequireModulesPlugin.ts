import { Plugin } from "obsidian";
import Module from "module";
import { join } from "path";

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
  private pluginRequire!: NodeJS.Require;
  private moduleRequire!: NodeJS.Require;

  public override onload(): void {
    this.pluginRequire = require;
    this.moduleRequire = Module.prototype.require;

    this.patchModuleRequire();
  }

  private patchModuleRequire(): void {
    Object.assign(patchedRequire, this.moduleRequire);
    Module.prototype.require = patchedRequire as NodeJS.Require;

    this.register(() => {
      Module.prototype.require = this.moduleRequire;
    });

    const plugin = this

    function patchedRequire(this: Module, id: string): unknown {
      return plugin.customRequire(id, this);
    }
  }

  public customRequire(id: string, module?: Module): unknown {
    if (this.builtInModuleNames.includes(id)) {
      return this.pluginRequire(id);
    }

    if (!module) {
      module = window.module;
    }

    if (!id.startsWith(".") || module.filename) {
      return this.moduleRequire.call(module, id);
    }

    const activeFile = this.app.workspace.getActiveFile();
    const currentDir = activeFile?.parent ?? this.app.vault.getRoot();
    const currentDirFullPath = this.app.vault.adapter.getFullPath(currentDir.path);
    const scriptFullPath = join(currentDirFullPath, id);
    return this.moduleRequire.call(module, scriptFullPath);
  }
}
