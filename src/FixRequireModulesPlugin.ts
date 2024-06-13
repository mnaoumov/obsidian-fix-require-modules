import {
  Platform,
  Plugin,
} from "obsidian";
import Module from "module";
import {
  dirname,
  isAbsolute,
  join,
  sep
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
  private moduleTimestamps = new Map<string, number>();
  private updatedModuleTimestamps = new Map<string, number>();

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

    const isRootRequire = this.updatedModuleTimestamps.size === 0;
    const convertedId = this.convertRequireId(id, currentScriptPath, module);
    this.getRecursiveTimestampAndInvalidateCache(convertedId);

    try {
      return this.moduleRequire.call(module, convertedId);
    } finally {
      if (isRootRequire) {
        this.updatedModuleTimestamps.clear();
      }
    }
  }

  private convertRequireId(id: string, currentScriptPath?: string, module?: Module): string {
    let currentScriptFullPath: string | null;

    if (id.startsWith(".")) {
      currentScriptFullPath = this.getCurrentScriptFullPath(currentScriptPath, module);
    } else if (id.startsWith("/")) {
      currentScriptFullPath = this.getFakeRootPath();
    } else {
      return id;
    }

    const currentDirFullPath = dirname(currentScriptFullPath);
    const scriptFullPath = join(currentDirFullPath, id);

    return scriptFullPath;
  }

  private getFakeRootPath(): string {
    return join(this.app.vault.adapter.getBasePath(), "fakeRoot.js");
  }

  private getCurrentScriptFullPath(currentScriptPath: string | undefined, module?: Module): string {
    let ans: string | null = null;
    if (module && module.filename) {
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

    /**
     * The caller line index is 6 because the call stack is as follows:
     *
     * 0: Error
     * 1:     at FixRequireModulesPlugin.getCurrentScriptFullPath
     * 2:     at FixRequireModulesPlugin.convertRequireId
     * 3:     at FixRequireModulesPlugin.customRequire
     * 4:     at Module.patchedRequire [as require]
     * 5:     at require
     * 6:     at functionName (path/to/caller.js:123:45)
     */
    const CALLER_LINE_INDEX = 6;
    const callStackLines = new Error().stack?.split("\n") ?? [];
    const callStackMatch = callStackLines.at(CALLER_LINE_INDEX)?.match(/^    at .+? \((.+?):\d+:\d+\)$/);
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

  private getRecursiveTimestampAndInvalidateCache(moduleName: string): number {
    const timestamp = this.getRecursiveTimestamp(moduleName);
    if (this.moduleTimestamps.get(moduleName) ?? 0 < timestamp) {
      this.moduleTimestamps.set(moduleName, timestamp);
      delete this.nodeRequire.cache[moduleName];
    }

    return timestamp;
  }

  private getRecursiveTimestamp(moduleName: string): number {
    if (this.updatedModuleTimestamps.has(moduleName)) {
      return this.updatedModuleTimestamps.get(moduleName)!;
    }

    if (!isAbsolute(moduleName)) {
      return 0;
    }

    if (!existsSync(moduleName)) {
      return new Date().getTime();
    }

    let ans = statSync(moduleName).mtimeMs;

    const cachedModule = this.nodeRequire.cache[moduleName];

    for (const childModule of cachedModule?.children ?? []) {
      const childTimestamp = this.getRecursiveTimestampAndInvalidateCache(childModule.filename);
      ans = Math.max(ans, childTimestamp);
    }

    return ans;
  }

  public async customImport(id: string, currentScriptPath?: string, module?: Module): Promise<unknown> {
    if (this.builtInModuleNames.includes(id)) {
      return this.pluginRequire(id);
    }

    if (!module) {
      module = window.module;
    }

    const isRootRequire = this.updatedModuleTimestamps.size === 0;
    const scriptFullPath = this.convertRequireId(id, currentScriptPath, module);
    const timestamp = this.getRecursiveTimestampAndInvalidateCache(scriptFullPath);
    let convertedId = scriptFullPath;

    if (timestamp > 0) {
      convertedId = `${Platform.resourcePathPrefix}${scriptFullPath.replaceAll(sep, "/")}?${timestamp}`;
    }

    try {
      const ans = await import(convertedId);
      this.nodeRequire.cache[scriptFullPath] = ans;
      return ans;
    } finally {
      if (isRootRequire) {
        this.updatedModuleTimestamps.clear();
      }
    }
  }
}
