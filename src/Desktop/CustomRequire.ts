// eslint-disable-next-line import-x/no-nodejs-modules
import Module from 'node:module';
import { App } from 'obsidian';
import {
  dirname,
  isAbsolute,
  join,
  toPosixPath
} from 'obsidian-dev-utils/Path';
import {
  existsSync,
  readFileSync,
  statSync
} from 'obsidian-dev-utils/scripts/NodeModules';
import {
  getPackageJsonPath,
  readPackageJsonSync
} from 'obsidian-dev-utils/scripts/Npm';
import { register } from 'tsx/cjs/api';

import type { FixRequireModulesPlugin } from './FixRequireModulesPlugin.ts';
import type { SourceMap } from './util/types.js';

import { builtInModuleNames } from '../BuiltInModuleNames.ts';
import { ESBUILD_MAIN_PATH } from './esbuild.ts';
import { convertPathToObsidianUrl } from './util/obsidian.ts';

interface EsModule {
  __esModule: boolean;
}

const specialModuleNames = [
  ...builtInModuleNames,
  'obsidian/app'
];

let app: App;
let plugin: FixRequireModulesPlugin;
let pluginRequire: NodeJS.Require;

const nodeRequire = window.require;
const moduleRequire = Module.prototype.require;
// eslint-disable-next-line @typescript-eslint/unbound-method
const moduleCompile = Module.prototype._compile;
// eslint-disable-next-line @typescript-eslint/unbound-method
const moduleLoad = Module.prototype.load;

const moduleTimestamps = new Map<string, number>();
const updatedModuleTimestamps = new Map<string, number>();
const moduleDependencies = new Map<string, Set<string>>();

let tsxModuleResolveFileName!: typeof Module._resolveFilename;
let tsx: Tsx;

interface SplitQueryResult {
  cleanStr: string;
  query: string;
}

export function clearCache(): void {
  moduleTimestamps.clear();
  updatedModuleTimestamps.clear();
  moduleDependencies.clear();

  for (const key of Object.keys(nodeRequire.cache)) {
    if (key.startsWith('electron') || key.includes('app.asar')) {
      continue;
    }

    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete nodeRequire.cache[key];
  }
}

export function customRequire(id: string, currentScriptPath?: string, module?: Module): unknown {
  if (!module) {
    module = window.module;
  }

  if (id.endsWith(getNodeRequireCacheKey(''))) {
    return moduleRequire.call(module, id);
  }

  id = toPosixPath(id);

  let currentScriptFullPath = getFakeRootPath();

  if (id.startsWith('./') || id.startsWith('../')) {
    currentScriptFullPath = getCurrentScriptFullPath(currentScriptPath, module);
  } else if (id.startsWith('//')) {
    id = join(getVaultPath(), id.slice(2));
  } else if (id.startsWith('/')) {
    if (!safeExistsSync(id)) {
      id = `.${id}`;
    }
  } else if (!isAbsolute(id)) {
    return moduleRequire.call(module, id);
  }

  const currentDirFullPath = dirname(currentScriptFullPath);
  let scriptFullPath = isAbsolute(id) ? id : join(currentDirFullPath, id);

  try {
    scriptFullPath = customResolveFilename(scriptFullPath, module, false);
  } catch {
    return moduleRequire.call(module, scriptFullPath);
  }

  const cleanScriptFullPath = getFullPath(scriptFullPath) ?? scriptFullPath;
  const cleanModuleFullPath = getFullPath(module.filename);
  if (cleanModuleFullPath) {
    let currentModuleDependencies = moduleDependencies.get(cleanModuleFullPath);
    if (!currentModuleDependencies) {
      currentModuleDependencies = new Set<string>();
      moduleDependencies.set(cleanModuleFullPath, currentModuleDependencies);
    }

    currentModuleDependencies.add(cleanScriptFullPath);
  }

  const isRootRequire = updatedModuleTimestamps.size === 0;
  getRecursiveTimestampAndInvalidateCache(scriptFullPath);

  try {
    return moduleRequire.call(module, scriptFullPath);
  } finally {
    if (isRootRequire) {
      updatedModuleTimestamps.clear();
    }
  }
}

export function registerCustomRequire(plugin_: FixRequireModulesPlugin, pluginRequire_: NodeJS.Require): void {
  plugin = plugin_;
  app = plugin.app;
  pluginRequire = pluginRequire_;
  initTsx();
  applyPatches();
}

function applyPatches(): void {
  patch(window, 'require', customRequire as NodeJS.Require);
  patch(Module.prototype, 'require', patchedModuleRequire as NodeJS.Require);
  patch(Module.prototype, '_compile', patchedCompile);
  patch(Module.prototype, 'load', patchedLoad);
  patch(Module, '_resolveFilename', customResolveFilename);

  function patchedModuleRequire(this: Module, id: string): unknown {
    return customRequire(id, undefined, this);
  }

  function patchedCompile(this: Module, content: string, filename: string): unknown {
    return customCompile(content, filename, this);
  }

  function patchedLoad(this: Module, filename: string): void {
    customLoad(filename, this);
  }
}

function customCompile(content: string, filename: string, module: Module): unknown {
  content = content.replaceAll(/(\n\/\/# sourceMappingURL=data:application\/json;base64,)(.+)/g, (_: string, prefix: string, sourceMapBase64: string): string => prefix + fixSourceMap(sourceMapBase64));
  return moduleCompile.call(module, content, filename);
}

function customLoad(filename: string, nodeModule: Module): void {
  filename = toPosixPath(filename);

  if (filename.endsWith(getNodeRequireCacheKey(''))) {
    moduleLoad.call(nodeModule, filename);
    return;
  }

  const { cleanStr } = splitQuery(filename);
  filename = cleanStr;
  const specialModule = specialModuleLoad(filename);
  if (specialModule) {
    nodeModule.exports = specialModule;
    nodeModule.loaded = true;
    return;
  }

  if (isAbsolute(filename)) {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete nodeRequire.cache[getNodeRequireCacheKey(filename)];
    const loadedModule = tsx.require(filename, filename) as Partial<EsModule>;
    if (nodeModule.exports && loadedModule.__esModule) {
      Object.assign(nodeModule.exports, loadedModule);
      Object.defineProperty(nodeModule.exports, '__esModule', { value: true });
    } else {
      nodeModule.exports = loadedModule;
    }

    nodeModule.loaded = true;
    return;
  }

  moduleLoad.call(nodeModule, filename);
}

function customResolveFilename(request: string, parent: Module, isMain: boolean, options?: { paths?: string[] }): string {
  if (request.endsWith(getNodeRequireCacheKey(''))) {
    return toPosixPath(tsxModuleResolveFileName(request, parent, isMain, options));
  }

  const { cleanStr: cleanRequest, query } = splitQuery(request);
  if (query) {
    const cleanFilename = customResolveFilename(cleanRequest, parent, isMain, options);
    return cleanFilename + query;
  }

  request = toPosixPath(request);

  if (request === '.') {
    request = './index.js';
  }

  if (specialModuleNames.includes(request)) {
    return request;
  }

  if (request === 'esbuild') {
    return join(getVaultPath(), plugin.manifest.dir ?? '', ESBUILD_MAIN_PATH);
  }

  if (request.startsWith('#')) {
    const resolvedPath = resolvePrivateImportPath(request, parent.path);
    if (resolvedPath) {
      return customResolveFilename(resolvedPath, parent, isMain, options);
    }
  }

  const isRelative = request.startsWith('./') || request.startsWith('../');
  const path = isRelative && parent.filename ? join(dirname(parent.filename), request) : request;
  options ??= {};
  options.paths ??= [];
  options.paths.push(...parent.paths);
  options.paths.push(join(getVaultPath(), plugin.settingsCopy.modulesRoot, 'node_modules'));
  return splitQuery(toPosixPath(tsxModuleResolveFileName(path, parent, isMain, options))).cleanStr;
}

function fixSourceMap(sourceMapBase64: string): string {
  const sourceMapJson = Buffer.from(sourceMapBase64, 'base64').toString('utf8');
  const sourceMap = JSON.parse(sourceMapJson) as SourceMap;
  sourceMap.sources = sourceMap.sources.map(convertPathToObsidianUrl);
  return Buffer.from(JSON.stringify(sourceMap)).toString('base64');
}

function getCurrentScriptFullPath(currentScriptPath: string | undefined, module?: Module): string {
  let ans: null | string = null;
  if (module?.filename) {
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
  const callStackLines = new Error().stack?.split('\n') ?? [];
  console.debug('callStackLines', { callStackLines });
  const callStackMatch = callStackLines.at(CALLER_LINE_INDEX)?.match(/^ {4}at .+? \((.+?):\d+:\d+\)$/);
  if (callStackMatch) {
    const callerScriptPath = callStackMatch[1] ?? '';
    ans = getFullPath(callerScriptPath);
    if (ans) {
      return ans;
    }
  }

  const activeFile = app.workspace.getActiveFile();
  if (activeFile) {
    return getFullPath(activeFile.path) ?? '';
  } else {
    return getFakeRootPath();
  }
}

function getFakeRootPath(): string {
  return join(getVaultPath(), plugin.settingsCopy.modulesRoot, 'fakeRoot.js');
}

function getFullPath(path: null | string | undefined): null | string {
  if (!path) {
    return null;
  }
  path = toPosixPath(path);
  const fullPath = isAbsolute(path) ? path : join(getVaultPath(), path);
  const { cleanStr: cleanPath } = splitQuery(fullPath);
  return safeExistsSync(cleanPath) ? cleanPath : null;
}

function getNodeRequireCacheKey(moduleName: string): string {
  return `${moduleName}?namespace=${plugin.manifest.id}`;
}

function getRecursiveTimestamp(moduleName: string): number {
  if (updatedModuleTimestamps.has(moduleName)) {
    return updatedModuleTimestamps.get(moduleName) ?? 0;
  }

  updatedModuleTimestamps.set(moduleName, 0);

  if (!isAbsolute(moduleName)) {
    return 0;
  }

  if (!safeExistsSync(moduleName)) {
    return new Date().getTime();
  }

  const cleanModuleName = splitQuery(moduleName).cleanStr;
  let ans = statSync(cleanModuleName).mtimeMs;

  for (const childModule of moduleDependencies.get(cleanModuleName) ?? []) {
    const childTimestamp = getRecursiveTimestampAndInvalidateCache(childModule);
    ans = Math.max(ans, childTimestamp);
  }

  return ans;
}

function getRecursiveTimestampAndInvalidateCache(moduleName: string): number {
  const timestamp = getRecursiveTimestamp(moduleName);
  if ((moduleTimestamps.get(moduleName) ?? 0) < timestamp) {
    moduleTimestamps.set(moduleName, timestamp);
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete nodeRequire.cache[moduleName];
    moduleDependencies.delete(moduleName);
  }

  return timestamp;
}

function getVaultPath(): string {
  return toPosixPath(app.vault.adapter.basePath);
}

function initTsx(): void {
  tsx = register({ namespace: plugin.manifest.id });
  tsxModuleResolveFileName = Module._resolveFilename.bind(Module);
  plugin.register(tsx.unregister);
}

function patch<T, K extends keyof T>(obj: T, key: K, newValue: object & T[K]): void {
  const original = obj[key];
  obj[key] = Object.assign(newValue, original);
  plugin.register(() => {
    obj[key] = original;
  });
}

function resolvePrivateImportPath(request: string, parentPath: string): null | string {
  const packageJsonDirPath = dirname(getPackageJsonPath(parentPath));
  const packageJson = readPackageJsonSync(parentPath);
  if (!packageJson.imports) {
    return null;
  }

  const importMap = packageJson.imports;
  const importsSetting = importMap[request as keyof typeof importMap];
  if (!importsSetting) {
    return null;
  }

  let pathOrConditions = importsSetting;

  if (Array.isArray(importsSetting)) {
    const maybePathOrConditions = importsSetting[0];
    if (!maybePathOrConditions) {
      return null;
    }
    pathOrConditions = maybePathOrConditions;
  } else {
    pathOrConditions = importsSetting;
  }

  if (typeof pathOrConditions === 'string') {
    return join(packageJsonDirPath, pathOrConditions);
  }

  const path = pathOrConditions['node'] ?? pathOrConditions['require'] ?? pathOrConditions['default'];
  if (!path) {
    return null;
  }

  if (typeof path === 'string') {
    return join(packageJsonDirPath, path);
  }

  return null;
}

function safeExistsSync(path: string): boolean {
  return existsSync(splitQuery(path).cleanStr);
}

function specialModuleLoad(filename: string): unknown {
  if (builtInModuleNames.includes(filename)) {
    return pluginRequire(filename) as unknown;
  }

  if (filename === 'obsidian/app') {
    return app;
  }

  if (filename.endsWith('.json')) {
    const json = readFileSync(filename, 'utf-8');
    return JSON.parse(json);
  }

  return;
}

function splitQuery(str: string): SplitQueryResult {
  const queryIndex = str.indexOf('?');
  return {
    cleanStr: queryIndex !== -1 ? str.slice(0, queryIndex) : str,
    query: queryIndex !== -1 ? str.slice(queryIndex) : ''
  };
}
