import { Plugin } from "obsidian";
import Module from "module";
import {
  dirname,
  join
} from "path";
import {
  existsSync,
  statSync
} from "fs";

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
  private nodeRequire!: NodeJS.Require;
  private moduleRequire!: NodeJS.Require;
  private moduleTimeStamps = new Map<string, number>();

  public override onload(): void {
    this.pluginRequire = require;
    this.nodeRequire = window.require;
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

    let currentDirFullPath: string;

    if (id.startsWith(".")) {
      if (module.filename) {
        currentDirFullPath = dirname(module.filename);
      } else {
        const activeFile = this.app.workspace.getActiveFile();
        const currentDir = activeFile?.parent ?? this.app.vault.getRoot();
        currentDirFullPath = this.app.vault.adapter.getFullPath(currentDir.path);
      }
    } else if (id.startsWith("/")) {
      currentDirFullPath = this.app.vault.adapter.getBasePath();
    } else {
      return this.moduleRequire.call(module, id);
    }

    const scriptFullPath = join(currentDirFullPath, id);
    if (!this.isCacheValid(scriptFullPath)) {
      delete this.nodeRequire.cache[scriptFullPath];
    }
    return this.moduleRequire.call(module, scriptFullPath);
  }

  private isCacheValid(scriptFullPath: string): boolean {
    if (!existsSync(scriptFullPath)) {
      return false;
    }

    const fileTimestamp = statSync(scriptFullPath).mtimeMs;
    const savedTimestamp = this.moduleTimeStamps.get(scriptFullPath);
    if (fileTimestamp !== savedTimestamp) {
      return false;
    }

    const cachedModule = this.nodeRequire.cache[scriptFullPath];
    if (!cachedModule) {
      return true;
    }

    for (const childModule of cachedModule.children) {
      if (!this.isCacheValid(childModule.filename)) {
        return false;
      }
    }

    return true;
  }
}
