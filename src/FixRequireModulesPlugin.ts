import {
  existsSync,
  statSync
} from "node:fs";
import { join } from "node:path";
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
  private pluginRequire!: NodeJS.Require;
  private nodeRequire!: NodeJS.Require;
  private moduleRequire!: NodeJS.Require;

  public override onload(): void {
    this.pluginRequire = require;
    this.nodeRequire = window.require;
    this.moduleRequire = Module.prototype.require;

    this.patchModuleRequire();
  }

  private canResolveModule(id: string): boolean {
    try {
      this.nodeRequire.resolve(id);
      return true;
    } catch {
      return false;
    }
  }

  private patchModuleRequire(): void {
    const patchedRequire = this.customRequire as NodeJS.Require;
    Object.assign(patchedRequire, this.moduleRequire);
    Module.prototype.require = patchedRequire;

    this.register(() => {
      Module.prototype.require = this.moduleRequire;
    });
  }

  private customRequire(id: string): unknown {
    if (this.canResolveModule(id)) {
      return this.moduleRequire(id);
    }

    if (this.builtInModuleNames.includes(id)) {
      return this.pluginRequire(id);
    }

    if (!id.startsWith(".")) {
      return this.moduleRequire(id);
    }

    const activeFile = this.app.workspace.getActiveFile();
    const currentDir = activeFile?.parent ?? this.app.vault.getRoot();
    const fullPath = this.app.vault.adapter.getFullPath(currentDir.path);
    const scriptPath = join(fullPath, id);

    if (existsSync(scriptPath)) {
      const ctimeMs = statSync(scriptPath).ctimeMs;
      return this.moduleRequire(`${scriptPath}?${ctimeMs}`);
    }

    return this.moduleRequire(id);
  }
}
