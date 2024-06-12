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

  public override onload(): void {
    const pluginRequire = require;

    const originalRequire = Module.prototype.require;
    const newRequire = ((id: string): unknown => {
      if (this.canResolveModule(id)) {
        return originalRequire(id);
      }

      if (this.builtInModuleNames.includes(id)) {
        return pluginRequire(id);
      }

      if (!id.startsWith(".")) {
        return originalRequire(id);
      }

      const activeFile = this.app.workspace.getActiveFile();
      const currentDir = activeFile?.parent ?? this.app.vault.getRoot();
      const fullPath = this.app.vault.adapter.getFullPath(currentDir.path);
      const scriptPath = join(fullPath, id);

      if (this.canResolveModule(scriptPath)) {
        const resolvedPath = window.require.resolve(scriptPath);
        delete window.require.cache[resolvedPath];
        return originalRequire(scriptPath);
      }

      return originalRequire(id);
    }) as NodeJS.Require;

    Object.assign(newRequire, originalRequire);

    Module.prototype.require = newRequire;

    this.register(() => {
      Module.prototype.require = originalRequire;
    });
  }

  private canResolveModule(id: string): boolean {
    try {
      window.require.resolve(id);
      return true;
    } catch {
      return false;
    }
  }
}
