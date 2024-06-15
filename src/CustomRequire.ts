import Module from "node:module";
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
import { Plugin } from "obsidian";

type Tsx = {
  (): void,
  require: (id: string, fromFile: string | URL) => unknown;
  resolve: (id: string, fromFile: string | URL, resolveOptions?: { paths?: string[] | undefined; } | undefined) => string;
  unregister: () => void;
};

type UninstallerRegister = (uninstaller: () => void) => void;

export const builtInModuleNames = [
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

export const nodeRequire = window.require;
export const moduleRequire = Module.prototype.require;
export const moduleResolveFileName = Module._resolveFilename.bind(Module);
const moduleTimestamps = new Map<string, number>();
const updatedModuleTimestamps = new Map<string, number>();
const moduleDependencies = new Map<string, Set<string>>();
let tsxModuleResolveFileName!: typeof Module._resolveFilename;
let tsx: Tsx;
let pluginRequire: NodeJS.Require;
let pluginId: string;
let esBuildPath: string;
let fakeRootPath: string;
let basePath: string;
let getActiveFile: () => { path: string; } | null;

export function customRequire(id: string, currentScriptPath?: string, module?: Module): unknown {
  if (builtInModuleNames.includes(id)) {
    return pluginRequire(id);
  }

  if (id === "esbuild") {
    return moduleRequire(esBuildPath);
  }

  if (!module) {
    module = window.module;
  }

  let currentScriptFullPath = fakeRootPath;

  if (id.startsWith(".")) {
    currentScriptFullPath = getCurrentScriptFullPath(currentScriptPath, module);
  } else if (!id.startsWith("/")) {
    return moduleRequire.call(module, id);
  }

  const currentDirFullPath = dirname(currentScriptFullPath);
  const scriptFullPath = join(currentDirFullPath, id);

  if (!existsSync(scriptFullPath)) {
    return moduleRequire.call(module, id);
  }

  const cleanModuleFullPath = getFullPath(module.filename);
  if (cleanModuleFullPath) {
    let currentModuleDependencies = moduleDependencies.get(cleanModuleFullPath);
    if (!currentModuleDependencies) {
      currentModuleDependencies = new Set<string>();
      moduleDependencies.set(cleanModuleFullPath, currentModuleDependencies);
    }

    currentModuleDependencies.add(scriptFullPath);
  }

  if (id.startsWith("/")) {
    id = `.${id}`;
  }

  const isRootRequire = updatedModuleTimestamps.size === 0;
  getRecursiveTimestampAndInvalidateCache(scriptFullPath);

  try {
    return tsx.require(id, currentScriptFullPath);
  }
  finally {
    if (isRootRequire) {
      updatedModuleTimestamps.clear();
    }
  }
}

function getCurrentScriptFullPath(currentScriptPath: string | undefined, module?: Module): string {
  let ans: string | null = null;
  if (module && module.filename) {
    ans = getFullPath(module.filename);
    if (!ans) {
      throw new Error(`Invalid module.filename ${module.filename}`);
    }

    return ans;
  }

  if (currentScriptPath) {
    ans = getFullPath(currentScriptPath);
    if (!ans) {
      throw new Error(`Invalid currentScriptPath ${currentScriptPath}`);
    }

    return ans;
  }

  /**
   * The caller line index is 3 because the call stack is as follows:
   *
   * 0: Error
   * 1:     at getCurrentScriptFullPath
   * 2:     at customRequire
   * 3:     at functionName (path/to/caller.js:123:45)
   */
  const CALLER_LINE_INDEX = 3;
  const callStackLines = new Error().stack?.split("\n") ?? [];
  console.debug(callStackLines);
  const callStackMatch = callStackLines.at(CALLER_LINE_INDEX)?.match(/^    at .+? \((.+?):\d+:\d+\)$/);
  if (callStackMatch) {
    const callerScriptPath = callStackMatch[1]!;
    ans = getFullPath(callerScriptPath);
    if (ans) {
      return ans;
    }
  }

  const activeFile = getActiveFile();
  if (activeFile) {
    return getFullPath(activeFile.path)!;
  } else {
    return fakeRootPath;
  }
}

function getFullPath(path: string | null | undefined): string | null {
  if (!path) {
    return null;
  }

  const fullPath = isAbsolute(path) ? path : join(basePath, path);
  const cleanPath = fullPath.split("?")[0]!;
  return existsSync(cleanPath) ? cleanPath : null;
}

function getRecursiveTimestampAndInvalidateCache(moduleName: string): number {
  const timestamp = getRecursiveTimestamp(moduleName);
  if ((moduleTimestamps.get(moduleName) ?? 0) < timestamp) {
    moduleTimestamps.set(moduleName, timestamp);
    delete nodeRequire.cache[getNodeRequireCacheKey(moduleName)];
    moduleDependencies.delete(moduleName);
  }

  return timestamp;
}

function getRecursiveTimestamp(moduleName: string): number {
  if (updatedModuleTimestamps.has(moduleName)) {
    return updatedModuleTimestamps.get(moduleName)!;
  }

  updatedModuleTimestamps.set(moduleName, 0);

  if (!isAbsolute(moduleName)) {
    return 0;
  }

  if (!existsSync(moduleName)) {
    return new Date().getTime();
  }

  let ans = statSync(moduleName).mtimeMs;

  for (const childModule of moduleDependencies.get(moduleName) ?? []) {
    const childTimestamp = getRecursiveTimestampAndInvalidateCache(childModule);
    ans = Math.max(ans, childTimestamp);
  }

  return ans;
}

export function customResolveFilename(request: string, parent: Module, isMain: boolean, options?: { paths?: string[] }): string {
  if (builtInModuleNames.includes(request)) {
    return request;
  }

  if (request === "esbuild") {
    return esBuildPath;
  }

  let path: string;

  if (!isAbsolute(request) && !request.startsWith(".")) {
    return moduleResolveFileName(request, parent, isMain, options);
  }

  if (isAbsolute(request) || !parent.filename) {
    path = request;
  } else {
    path = join(parent.filename, request);
  }

  if (!getFullPath(path)) {
    return moduleResolveFileName(request, parent, isMain, options);
  }

  return tsxModuleResolveFileName(request, parent, isMain, options);
}

function getNodeRequireCacheKey(moduleName: string): string {
  return `${moduleName}?namespace=${pluginId}`;
}

export function initTsx(plugin: Plugin): void {
  tsx = register({ namespace: pluginId });
  tsxModuleResolveFileName = Module._resolveFilename.bind(Module);
  plugin.register(tsx.unregister);
}

export function setPluginRequire(require: NodeJS.Require): void {
  pluginRequire = require;
}

function patch<T, K extends keyof T>(obj: T, key: K, newValue: T[K] & object, uninstallerRegister: UninstallerRegister): void {
  const original = obj[key];
  obj[key] = Object.assign(newValue, original);
  uninstallerRegister(() => {
    obj[key] = original;
  });
}

export function applyPatches(uninstallerRegister: UninstallerRegister): void {
  patch(window, "require", customRequire as NodeJS.Require, uninstallerRegister);
  patch(Module.prototype, "require", patchedModuleRequire as NodeJS.Require, uninstallerRegister);
  patch(Module, "_resolveFilename", customResolveFilename, uninstallerRegister);

  function patchedModuleRequire(this: Module, id: string): unknown {
    return customRequire(id, undefined, this);
  }
}

export function initPluginVariables(plugin: Plugin): void {
  pluginId = plugin.manifest.id;
  basePath = plugin.app.vault.adapter.getBasePath();
  esBuildPath = join(basePath, plugin.manifest.dir!, "node_modules/esbuild/lib/main.js");
  fakeRootPath = join(basePath, "fakeRoot.js");
  getActiveFile = plugin.app.workspace.getActiveFile.bind(plugin.app.workspace);
}
