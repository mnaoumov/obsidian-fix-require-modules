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
import {
  App,
} from "obsidian";
import { ESBUILD_MAIN_PATH } from "./esbuild.ts";
import type FixRequireModulesPlugin from "./FixRequireModulesPlugin.ts";
import { convertPathToObsidianUrl } from "./util/obsidian.ts";
import type { SourceMap } from "./util/types.js";

type MaybeEsModule = {
  __esModule?: boolean;
};

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

let app: App;
let plugin: FixRequireModulesPlugin;
let pluginRequire: NodeJS.Require;

const nodeRequire = window.require;
const moduleRequire = Module.prototype.require;
const moduleResolveFileName = Module._resolveFilename.bind(Module);
// eslint-disable-next-line @typescript-eslint/unbound-method
const moduleCompile = Module.prototype._compile;
// eslint-disable-next-line @typescript-eslint/unbound-method
const moduleLoad = Module.prototype.load;

const moduleTimestamps = new Map<string, number>();
const updatedModuleTimestamps = new Map<string, number>();
const moduleDependencies = new Map<string, Set<string>>();

let tsxModuleResolveFileName!: typeof Module._resolveFilename;
let tsx: Tsx;

export function registerCustomRequire(plugin_: FixRequireModulesPlugin, pluginRequire_: NodeJS.Require): void {
  plugin = plugin_;
  app = plugin.app;
  pluginRequire = pluginRequire_;
  initTsx();
  applyPatches();
}

export function customRequire(id: string, currentScriptPath?: string, module?: Module): unknown {
  if (!module) {
    module = window.module;
  }

  if (id.endsWith(getNodeRequireCacheKey(""))) {
    return moduleRequire.call(module, id);
  }

  let currentScriptFullPath = getFakeRootPath();

  if (id.startsWith("./") || id.startsWith("../")) {
    currentScriptFullPath = getCurrentScriptFullPath(currentScriptPath, module);
  } else if (id.startsWith("//")) {
    id = join(app.vault.adapter.getBasePath(), id.substring(2));
  } else if (id.startsWith("/")) {
    if (!existsSync(id)) {
      id = `.${id}`;
    }
  } else if (!isAbsolute(id)) {
    return moduleRequire.call(module, id);
  }

  const currentDirFullPath = dirname(currentScriptFullPath);
  const scriptFullPath = isAbsolute(id) ? id : join(currentDirFullPath, id);

  if (!existsSync(scriptFullPath)) {
    return moduleRequire.call(module, scriptFullPath);
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

  const isRootRequire = updatedModuleTimestamps.size === 0;
  getRecursiveTimestampAndInvalidateCache(scriptFullPath);

  try {
    return moduleRequire.call(module, scriptFullPath);
  }
  finally {
    if (isRootRequire) {
      updatedModuleTimestamps.clear();
    }
  }
}

function customResolveFilename(request: string, parent: Module, isMain: boolean, options?: { paths?: string[] }): string {
  if (request.endsWith(getNodeRequireCacheKey(""))) {
    return tsxModuleResolveFileName(request, parent, isMain, options);
  }

  const [cleanRequest = "", query = null] = request.split("?");
  if (query != null) {
    const cleanFilename = customResolveFilename(cleanRequest, parent, isMain, options);
    return `${cleanFilename}?${query}`;
  }

  if (builtInModuleNames.includes(request)) {
    return request;
  }

  if (request === "esbuild") {
    return join(app.vault.adapter.getBasePath(), plugin.manifest.dir!, ESBUILD_MAIN_PATH);
  }

  const isRelative = request.startsWith("./") || request.startsWith("../");
  const path = isRelative && parent.filename ? join(dirname(parent.filename), request) : request;
  return moduleResolveFileName(path, parent, isMain, options);
}

function customCompile(content: string, filename: string, module: Module): unknown {
  content = content.replaceAll(/\n\/\/# sourceMappingURL=data:application\/json;base64,(.+)/g, (_: string, sourceMapBase64: string): string => {
    // HACK: The ${""} part is used to ensure Obsidian loads the plugin properly otherwise it stops loading it after the first line of the sourceMappingURL comment.
    return `
//#${""} sourceMappingURL=data:application/json;base64,${fixSourceMap(sourceMapBase64)}`;
  });
  return moduleCompile.call(module, content, filename);
}

function customLoad(filename: string, module: Module): void {
  if (filename.endsWith(getNodeRequireCacheKey(""))) {
    moduleLoad.call(module, filename);
    return;
  }

  filename = filename.split("?")[0]!;

  if (builtInModuleNames.includes(filename)) {
    module.exports = pluginRequire(filename) as unknown;
    module.loaded = true;
    return;
  }

  if (isAbsolute(filename)) {
    delete nodeRequire.cache[getNodeRequireCacheKey(filename)];
    const loadedModule = tsx.require(filename, filename) as MaybeEsModule;
    if (module.exports && loadedModule.__esModule) {
      Object.assign(module.exports, loadedModule);
    } else {
      module.exports = loadedModule;
    }

    module.loaded = true;
    return;
  }

  moduleLoad.call(module, filename);
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

  const activeFile = app.workspace.getActiveFile();
  if (activeFile) {
    return getFullPath(activeFile.path)!;
  } else {
    return getFakeRootPath();
  }
}

function getFullPath(path: string | null | undefined): string | null {
  if (!path) {
    return null;
  }

  const fullPath = isAbsolute(path) ? path : join(app.vault.adapter.getBasePath(), path);
  const cleanPath = fullPath.split("?")[0]!;
  return existsSync(cleanPath) ? cleanPath : null;
}

function getRecursiveTimestampAndInvalidateCache(moduleName: string): number {
  const timestamp = getRecursiveTimestamp(moduleName);
  if ((moduleTimestamps.get(moduleName) ?? 0) < timestamp) {
    moduleTimestamps.set(moduleName, timestamp);
    delete nodeRequire.cache[moduleName];
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

function getNodeRequireCacheKey(moduleName: string): string {
  return `${moduleName}?namespace=${plugin.manifest.id}`;
}

function patch<T, K extends keyof T>(obj: T, key: K, newValue: T[K] & object): void {
  const original = obj[key];
  obj[key] = Object.assign(newValue, original);
  plugin.register(() => {
    obj[key] = original;
  });
}

function fixSourceMap(sourceMapBase64: string): string {
  const sourceMapJson = Buffer.from(sourceMapBase64, "base64").toString("utf8");
  const sourceMap = JSON.parse(sourceMapJson) as SourceMap;
  sourceMap.sources = sourceMap.sources.map(convertPathToObsidianUrl);
  return Buffer.from(JSON.stringify(sourceMap)).toString("base64");
}

function initTsx(): void {
  tsx = register({ namespace: plugin.manifest.id });
  tsxModuleResolveFileName = Module._resolveFilename.bind(Module);
  plugin.register(tsx.unregister);
}

function getFakeRootPath(): string {
  return join(app.vault.adapter.getBasePath(), plugin.settings.modulesRoot, "fakeRoot.js").replaceAll("\\", "/");
}

function applyPatches(): void {
  patch(window, "require", customRequire as NodeJS.Require);
  patch(Module.prototype, "require", patchedModuleRequire as NodeJS.Require);
  patch(Module.prototype, "_compile", patchedCompile);
  patch(Module.prototype, "load", patchedLoad);
  patch(Module, "_resolveFilename", customResolveFilename);

  function patchedModuleRequire(this: Module, id: string): unknown {
    return customRequire(id, undefined, this);
  }

  function patchedCompile(this: Module, content: string, filename: string): unknown {
    return customCompile(content, filename, this);
  }

  function patchedLoad(this: Module, filename: string): void {
    return customLoad(filename, this);
  }
}
