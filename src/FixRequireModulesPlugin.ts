import { Plugin } from "obsidian";
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

import { register } from "tsx/cjs/api";

declare module "node:module" {
  export function _resolveFilename(request: string, parent: Module, isMain: boolean, options?: { paths?: string[] }): string;
}

type Tsx = {
  (): void,
  require: (id: string, fromFile: string | URL) => unknown;
  resolve: (id: string, fromFile: string | URL, resolveOptions?: { paths?: string[] | undefined; } | undefined) => string;
  unregister: () => void;
};

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
  private moduleResolveFileName!: typeof Module._resolveFilename;
  private tsxModuleResolveFileName!: typeof Module._resolveFilename;
  private moduleDependencies = new Map<string, Set<string>>();
  private tsx!: Tsx;

  public override onload(): void {
    this.pluginRequire = require;
    this.nodeRequire = window.require;
    this.moduleRequire = Module.prototype.require;
    this.moduleResolveFileName = Module._resolveFilename.bind(Module);
    this.tsx = register({ namespace: FixRequireModulesPlugin.name });
    this.tsxModuleResolveFileName = Module._resolveFilename.bind(Module);

    this.patchNodeRequire();
    this.patchModuleRequire();

    this.register(() => this.tsx.unregister());
    this.patchModuleResolveFileName();
  }

  private patchNodeRequire(): void {
    window.require = this.customRequire.bind(this) as NodeJS.Require;
    Object.assign(window.require, this.nodeRequire);
    this.register(() => {
      window.require = this.nodeRequire;
    });
  }

  private patchModuleRequire(): void {
    Object.assign(patchedModuleRequire, this.moduleRequire);
    Module.prototype.require = patchedModuleRequire as NodeJS.Require;

    this.register(() => {
      Module.prototype.require = this.moduleRequire;
    });

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const plugin = this;

    function patchedModuleRequire(this: Module, id: string): unknown {
      return plugin.customRequire(id, undefined, this);
    }
  }

  private patchModuleResolveFileName(): void {
    Module._resolveFilename = this.customResolveFilename.bind(this);
    this.register(() => {
      Module._resolveFilename = this.moduleResolveFileName;
    });
  }

  private customRequire(id: string, currentScriptPath?: string, module?: Module): unknown {
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
    } else if (!id.startsWith("/")) {
      return this.moduleRequire.call(module, id);
    }

    const currentDirFullPath = dirname(currentScriptFullPath);
    const scriptFullPath = join(currentDirFullPath, id);

    if (!existsSync(scriptFullPath)) {
      return this.moduleRequire.call(module, id);
    }

    const cleanModuleFullPath = this.getFullPath(module.filename);
    if (cleanModuleFullPath) {
      let currentModuleDependencies = this.moduleDependencies.get(cleanModuleFullPath);
      if (!currentModuleDependencies) {
        currentModuleDependencies = new Set<string>();
        this.moduleDependencies.set(cleanModuleFullPath, currentModuleDependencies);
      }

      currentModuleDependencies.add(scriptFullPath);
    }

    if (id.startsWith("/")) {
      id = `.${id}`;
    }

    const isRootRequire = this.updatedModuleTimestamps.size === 0;
    this.getRecursiveTimestampAndInvalidateCache(scriptFullPath);

    try {
      return this.tsx.require(id, currentScriptFullPath);
    }
    finally {
      if (isRootRequire) {
        this.updatedModuleTimestamps.clear();
      }
    }
  }

  private getEsbuildPath(): string {
    return join(this.app.vault.adapter.getBasePath(), this.manifest.dir!, "node_modules/esbuild/lib/main.js");
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
     * 3:     at functionName (path/to/caller.js:123:45)
     */

    const CALLER_LINE_INDEX = 3;
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
      delete this.nodeRequire.cache[this.getNodeRequireCacheKey(moduleName)];
      this.moduleDependencies.delete(moduleName);
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

    for (const childModule of this.moduleDependencies.get(moduleName) ?? []) {
      const childTimestamp = this.getRecursiveTimestampAndInvalidateCache(childModule);
      ans = Math.max(ans, childTimestamp);
    }

    return ans;
  }

  private customResolveFilename(request: string, parent: Module, isMain: boolean, options?: { paths?: string[] }): string {
    if (this.builtInModuleNames.includes(request)) {
      return request;
    }

    if (request === "esbuild") {
      return this.getEsbuildPath();
    }

    let path: string;

    if (!isAbsolute(request) && !request.startsWith(".")) {
      return this.moduleResolveFileName(request, parent, isMain, options);
    }

    if (isAbsolute(request) || !parent.filename) {
      path = request;
    } else {
      path = join(parent.filename, request);
    }

    if (!this.getFullPath(path)) {
      return this.moduleResolveFileName(request, parent, isMain, options);
    }

    return this.tsxModuleResolveFileName(request, parent, isMain, options);
  }

  private getNodeRequireCacheKey(moduleName: string): string {
    return `${moduleName}?namespace=${FixRequireModulesPlugin.name}`;
  }
}
