import {
  Plugin,
  TFile
} from "obsidian";
import Module from "module";
import {
  dirname,
  isAbsolute,
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
  private cacheValidMap = new Map<string, boolean>();

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
      return plugin.customRequire(id, undefined, this);
    }
  }

  public customRequire(id: string, currentScriptPath?: string, module?: Module): unknown {
    if (this.builtInModuleNames.includes(id)) {
      return this.pluginRequire(id);
    }

    if (!module) {
      module = window.module;
    }

    let currentScriptFullPath: string | null;

    if (id.startsWith(".")) {
      currentScriptFullPath = this.getCurrentScriptFullPath(currentScriptPath, module);
    } else if (id.startsWith("/")) {
      currentScriptFullPath = this.getFakeRootPath();
    } else {
      return this.moduleRequire.call(module, id);
    }

    const currentDirFullPath = dirname(currentScriptFullPath);
    const scriptFullPath = join(currentDirFullPath, id);

    const isRootRequire = this.cacheValidMap.size === 0;
    this.checkAndUpdateCacheValidity(scriptFullPath);

    try {
      return this.moduleRequire.call(module, scriptFullPath);
    } finally {
      if (isRootRequire) {
        this.cacheValidMap.clear();
      }
    }
  }

  private getFakeRootPath(): string {
    return join(this.app.vault.adapter.getBasePath(), "fakeRoot.js");
  }

  private getCurrentScriptFullPath(currentScriptPath: string | undefined, module: Module): string {
    let ans: string | null = null;
    if (module.filename) {
      ans = this.getFullPath(module.filename);
      if (!ans) {
        throw new Error(`Invalid module.filename ${module.filename}`);
      }

      return ans;
    }

    if (currentScriptPath) {
      ans = this.getFullPath(currentScriptPath);
      if (!ans) {
        throw new Error(`Invalid currentScriptPath ${currentScriptPath}`);
      }

      return ans;
    }

    const callStackMatch = new Error().stack?.split("\n").at(4)?.match(/^    at .+? \((.+?):\d+:\d+\)$/);
    if (callStackMatch) {
      const callerScriptPath = callStackMatch[1]!;
      ans = this.getFullPath(callerScriptPath);
      if (ans) {
        return ans;
      }
    }

    const activeFile = this.app.workspace.getActiveFile();
    if (activeFile) {
      return this.getFullPath(activeFile.path)!;
    } else {
      return this.getFakeRootPath();
    }
  }

  private getFullPath(path: string | null | undefined): string | null {
    if (!path) {
      return null;
    }

    const fullPath = isAbsolute(path) ? path : join(this.app.vault.adapter.getBasePath(), path);
    return existsSync(fullPath) ? fullPath : null;
  }

  private checkAndUpdateCacheValidity(moduleName: string): boolean {
    const isValid = this.checkCacheValidity(moduleName);
    this.cacheValidMap.set(moduleName, isValid);

    if (!isValid) {
      delete this.nodeRequire.cache[moduleName];
    }

    return isValid;
  }

  private checkCacheValidity(moduleName: string): boolean {
    if (this.cacheValidMap.has(moduleName)) {
      return this.cacheValidMap.get(moduleName)!;
    }

    if (!isAbsolute(moduleName)) {
      return true;
    }

    const cachedModule = this.nodeRequire.cache[moduleName];
    if (!cachedModule) {
      return true;
    }

    if (!existsSync(moduleName)) {
      return false;
    }

    const fileTimestamp = statSync(moduleName).mtimeMs;
    const savedTimestamp = this.moduleTimeStamps.get(moduleName);
    if (fileTimestamp !== savedTimestamp) {
      this.moduleTimeStamps.set(moduleName, fileTimestamp);
      return false;
    }

    for (const childModule of cachedModule.children) {
      if (!this.checkAndUpdateCacheValidity(childModule.filename)) {
        return false;
      }
    }

    return true;
  }
}
