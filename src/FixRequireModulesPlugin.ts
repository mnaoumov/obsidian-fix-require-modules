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

import { require as tsxRequire } from "tsx/cjs/api";

type ModuleConstructor = typeof Module;

interface ModuleExConstructor extends ModuleConstructor {
  _resolveFilename(request: string, parent: Module, isMain: boolean, options?: { paths?: string[] }): string;
}

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
  private patchedModuleRequire!: NodeJS.Require;
  private moduleTimestamps = new Map<string, number>();
  private updatedModuleTimestamps = new Map<string, number>();
  private moduleResolveFileName!: (request: string, parent: Module, isMain: boolean, options?: { paths?: string[]; } | undefined) => string;

  public override onload(): void {
    this.pluginRequire = require;
    this.nodeRequire = window.require;
    this.moduleRequire = Module.prototype.require;
    const ModuleEx = Module as ModuleExConstructor;
    this.moduleResolveFileName = ModuleEx._resolveFilename.bind(ModuleEx);

    this.patchModuleRequire();
  }

  private patchModuleRequire(): void {
    Object.assign(patchedModuleRequire, this.moduleRequire);
    Module.prototype.require = patchedModuleRequire as NodeJS.Require;
    this.patchedModuleRequire = Module.prototype.require;

    this.register(() => {
      Module.prototype.require = this.moduleRequire;
    });

    const ModuleEx = Module as ModuleExConstructor;
    ModuleEx._resolveFilename = this.customResolveFilename.bind(this);
    this.register(() => {
      ModuleEx._resolveFilename = this.moduleResolveFileName;
    });

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const plugin = this;

    function patchedModuleRequire(this: Module, id: string): unknown {
      return plugin.customRequire(id, undefined, this);
    }
  }

  public customRequire(id: string, currentScriptPath?: string, module?: Module): unknown {
    if (this.builtInModuleNames.includes(id)) {
      return this.pluginRequire(id);
    }

    if (id === "esbuild") {
      return this.moduleRequire(this.getEsbuildPath());
    }

    if (!module) {
      module = window.module;
    }

    let currentScriptFullPath = this.getFakeRootPath();

    if (id.startsWith(".")) {
      currentScriptFullPath = this.getCurrentScriptFullPath(currentScriptPath, module);
    } else if (id.startsWith("/")) {
      id = `.${id}`;
    } else {
      return this.moduleRequire.call(module, id);
    }

    const isRootRequire = this.updatedModuleTimestamps.size === 0;
    const currentDirFullPath = dirname(currentScriptFullPath);
    const scriptFullPath = join(currentDirFullPath, id);

    this.getRecursiveTimestampAndInvalidateCache(scriptFullPath);

    try {
      Module.prototype.require = this.moduleRequire;
      return tsxRequire(id, scriptFullPath) as unknown;
    }
    finally {
      if (isRootRequire) {
        this.updatedModuleTimestamps.clear();
      }
      Module.prototype.require = this.patchedModuleRequire;
    }
  }

  private getEsbuildPath(): string {
    return join(this.app.vault.adapter.getBasePath(), this.app.vault.configDir, "plugins/fix-require-modules/node_modules/esbuild/lib/main.js");
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
     * 2:     at FixRequireModulesPlugin.customRequire
     * 3:     at Module.patchedRequire [as require]
     * 4:     at require
     * 5:     at functionName (path/to/caller.js:123:45)
     */

    const CALLER_LINE_INDEX = 5;
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
    const cleanPath = fullPath.split("?")[0]!;
    return existsSync(cleanPath) ? cleanPath : null;
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
      return this.pluginRequire(id) as unknown;
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
      return await import(convertedId) as unknown;
    } finally {
      if (isRootRequire) {
        this.updatedModuleTimestamps.clear();
      }
    }
  }

  private customResolveFilename(request: string, parent: Module, isMain: boolean, options?: { paths?: string[] }): string {
    if (this.builtInModuleNames.includes(request)) {
      return request;
    }

    if (request === "esbuild") {
      return this.getEsbuildPath();
    }

    return this.moduleResolveFileName(request, parent, isMain, options);
  }
}
