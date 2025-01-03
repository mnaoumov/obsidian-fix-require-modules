import type { MaybePromise } from 'obsidian-dev-utils/Async';
import type { PackageJson } from 'obsidian-dev-utils/scripts/Npm';

import { Platform } from 'obsidian';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  toPosixPath
} from 'obsidian-dev-utils/Path';
import { trimStart } from 'obsidian-dev-utils/String';
import { isUrl } from 'obsidian-dev-utils/url';

import type { FixRequireModulesPlugin } from './FixRequireModulesPlugin.ts';
import type { RequireExFn } from './types.js';

import { transformToCommonJs } from './babel/Babel.ts';
import { extractRequireArgsList } from './babel/babelPluginExtractRequireArgsList.ts';
import { builtInModuleNames } from './BuiltInModuleNames.ts';
import { CacheInvalidationMode } from './CacheInvalidationMode.ts';

export enum ResolvedType {
  Module = 'module',
  Path = 'path',
  Url = 'url'
}

const PACKAGE_JSON = 'package.json';

export type PluginRequireFn = (id: string) => unknown;

export interface RequireOptions {
  cacheInvalidationMode: CacheInvalidationMode;
  parentPath?: string;
}

type ModuleFnAsync = (require: NodeRequire, module: { exports: unknown }, exports: unknown) => Promise<void>;

interface ResolveResult {
  resolvedId: string;
  resolvedType: ResolvedType;
}

interface SplitQueryResult {
  cleanStr: string;
  query: string;
}

export const MODULE_NAME_SEPARATOR = '*';
const VAULT_ROOT_PREFIX = '//';

export abstract class CustomRequire {
  protected readonly moduleDependencies = new Map<string, Set<string>>();
  protected modulesCache!: NodeJS.Dict<NodeModule>;
  protected readonly moduleTimestamps = new Map<string, number>();
  protected originalRequire!: NodeRequire;
  protected plugin!: FixRequireModulesPlugin;
  protected requireEx!: RequireExFn;
  protected requireWithCacheWithoutInvalidation!: RequireExFn;
  protected vaultAbsolutePath!: string;
  private pluginRequire!: PluginRequireFn;
  private updatedModuleTimestamps = new Map<string, number>();

  public clearCache(): void {
    this.moduleTimestamps.clear();
    this.updatedModuleTimestamps.clear();
    this.moduleDependencies.clear();

    for (const key of Object.keys(this.modulesCache)) {
      if (key.startsWith('electron') || key.includes('app.asar')) {
        continue;
      }

      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete this.modulesCache[key];
    }
  }

  public register(plugin: FixRequireModulesPlugin, pluginRequire: PluginRequireFn): void {
    this.plugin = plugin;
    this.pluginRequire = pluginRequire;
    this.vaultAbsolutePath = toPosixPath(plugin.app.vault.adapter.basePath);
    this.originalRequire = window.require;

    this.requireEx = Object.assign(this.require.bind(this), {
      cache: {}
    }, this.originalRequire);
    this.modulesCache = this.requireEx.cache;

    this.requireWithCacheWithoutInvalidation = Object.assign(this.requireWithoutInvalidation.bind(this), {
      cache: {}
    }, this.requireEx);

    window.require = this.requireEx;
    plugin.register(() => window.require = this.originalRequire);

    window.requireAsync = this.requireAsync.bind(this);
    plugin.register(() => delete window.requireAsync);

    window.requireAsyncWrapper = this.requireAsyncWrapper.bind(this);
    plugin.register(() => delete window.requireAsyncWrapper);
  }

  protected addToModuleCache(id: string, module: unknown): void {
    this.modulesCache[id] = {
      children: [],
      exports: module,
      filename: '',
      id,
      isPreloading: false,
      loaded: true,
      parent: null,
      path: '',
      paths: [],
      require: this.requireEx
    };
  }

  protected abstract canRequireNonCached(type: ResolvedType): boolean;

  protected abstract existsAsync(path: string): Promise<boolean>;

  protected findEntryPoint(packageJson: PackageJson): string {
    return this.findExportsEntryPoint(packageJson.exports) ?? packageJson.main ?? 'index.js';
  }

  protected getRequireAsyncAdvice(isNewSentence?: boolean): string {
    let advice = `consider using

const module = await requireAsync(id);

or

await requireAsyncWrapper((require) => {
  const module = require(id);
});`;

    if (isNewSentence) {
      advice = advice.charAt(0).toUpperCase() + advice.slice(1);
    }

    return advice;
  }

  protected abstract getTimestampAsync(path: string): Promise<number>;

  protected makeChildRequire(parentPath: string): NodeRequire {
    const childRequire = (id: string): unknown => this.childRequire(id, parentPath);
    return Object.assign(childRequire, this.requireEx);
  }

  protected abstract readFileAsync(path: string): Promise<string>;

  protected abstract requireNonCached(id: string, type: ResolvedType, cacheInvalidationMode: CacheInvalidationMode): unknown;

  protected requireSpecialModule(id: string): unknown {
    if (id === 'obsidian/app') {
      return this.plugin.app;
    }

    if (builtInModuleNames.includes(id)) {
      return this.pluginRequire(id);
    }

    return null;
  }

  protected resolve(id: string, parentPath?: string): ResolveResult {
    id = toPosixPath(id);

    if (isUrl(id)) {
      const FILE_URL_PREFIX = 'file:///';
      if (id.toLowerCase().startsWith(FILE_URL_PREFIX)) {
        return { resolvedId: id.slice(FILE_URL_PREFIX.length), resolvedType: ResolvedType.Path };
      }

      if (id.toLowerCase().startsWith(Platform.resourcePathPrefix)) {
        return { resolvedId: id.slice(Platform.resourcePathPrefix.length), resolvedType: ResolvedType.Path };
      }

      return { resolvedId: id, resolvedType: ResolvedType.Url };
    }

    if (id.startsWith(VAULT_ROOT_PREFIX)) {
      return { resolvedId: join(this.vaultAbsolutePath, trimStart(id, VAULT_ROOT_PREFIX)), resolvedType: ResolvedType.Path };
    }

    const MODULES_ROOT_PATH_PREFIX = '/';
    if (id.startsWith(MODULES_ROOT_PATH_PREFIX)) {
      return { resolvedId: join(this.vaultAbsolutePath, this.plugin.settingsCopy.modulesRoot, trimStart(id, MODULES_ROOT_PATH_PREFIX)), resolvedType: ResolvedType.Path };
    }

    if (isAbsolute(id)) {
      return { resolvedId: id, resolvedType: ResolvedType.Path };
    }

    parentPath = parentPath ? toPosixPath(parentPath) : this.getParentPathFromCallStack() ?? this.plugin.app.workspace.getActiveFile()?.path ?? 'fakeRoot.js';
    if (!isAbsolute(parentPath)) {
      parentPath = join(this.vaultAbsolutePath, parentPath);
    }
    const parentDir = dirname(parentPath);

    if (id.startsWith('./') || id.startsWith('../')) {
      return { resolvedId: join(parentDir, id), resolvedType: ResolvedType.Path };
    }

    return { resolvedId: `${parentDir}${MODULE_NAME_SEPARATOR}${id}`, resolvedType: ResolvedType.Module };
  }

  private async checkTimestampChangedAndReloadIfNeededAsync(path: string, cacheInvalidationMode: CacheInvalidationMode): Promise<boolean> {
    const timestamp = await this.getTimestampAsync(path);
    const cachedTimestamp = this.moduleTimestamps.get(path) ?? 0;
    if (timestamp !== cachedTimestamp) {
      const content = await this.readFileAsync(path);
      const module = await this.requireStringAsync(content, path);
      this.addToModuleCache(path, module);
      this.moduleTimestamps.set(path, timestamp);
      return true;
    }

    let ans = false;

    const dependencies = this.moduleDependencies.get(path) ?? [];
    for (const dependency of dependencies) {
      const { resolvedId, resolvedType } = this.resolve(dependency, path);
      switch (resolvedType) {
        case ResolvedType.Module:
          for (const rootDir of await this.getRootDirsAsync(path)) {
            const packageJsonPath = this.getPackageJsonPath(rootDir);
            if (!await this.existsAsync(packageJsonPath)) {
              continue;
            }

            if (await this.checkTimestampChangedAndReloadIfNeededAsync(packageJsonPath, cacheInvalidationMode)) {
              ans = true;
            }
          }
          break;
        case ResolvedType.Path:
          if (await this.checkTimestampChangedAndReloadIfNeededAsync(resolvedId, cacheInvalidationMode)) {
            ans = true;
          }
          break;
        case ResolvedType.Url: {
          if (cacheInvalidationMode === CacheInvalidationMode.Never) {
            continue;
          }

          ans = true;
          break;
        }
      }
    }

    return ans;
  }

  private childRequire(id: string, parentPath: string): unknown {
    let dependencies = this.moduleDependencies.get(parentPath);
    if (!dependencies) {
      dependencies = new Set<string>();
      this.moduleDependencies.set(parentPath, dependencies);
    }
    dependencies.add(id);
    return window.require(id, { parentPath });
  }

  private findExportsEntryPoint(exportsNode: PackageJson['exports'], isTopLevel = true): null | string {
    if (!exportsNode) {
      return null;
    }

    if (typeof exportsNode === 'string') {
      return exportsNode;
    }

    let exportConditions;

    if (Array.isArray(exportsNode)) {
      if (!exportsNode[0]) {
        return null;
      }

      if (typeof exportsNode[0] === 'string') {
        return exportsNode[0];
      }

      exportConditions = exportsNode[0];
    } else {
      exportConditions = exportsNode;
    }

    const path = exportConditions['require'] ?? exportConditions['import'] ?? exportConditions['default'];

    if (typeof path === 'string') {
      return path;
    }

    if (!isTopLevel) {
      return null;
    }

    return this.findExportsEntryPoint(exportConditions['.'], false);
  }

  private getPackageJsonPath(packageDir: string): string {
    return join(packageDir, PACKAGE_JSON);
  }

  private getParentPathFromCallStack(): null | string {
    /**
     * The caller line index is 4 because the call stack is as follows:
     *
     * 0: Error
     * 1:     at CustomRequireImpl.getParentPathFromCallStack (plugin:fix-require-modules:?:?)
     * 2:     at CustomRequireImpl.resolve (plugin:fix-require-modules:?:?)
     * 3:     at CustomRequireImpl.require (plugin:fix-require-modules:?:?)
     * 4:     at functionName (path/to/caller.js:?:?)
     */
    const CALLER_LINE_INDEX = 4;
    const callStackLines = new Error().stack?.split('\n') ?? [];
    console.debug({ callStackLines });
    const callStackMatch = callStackLines.at(CALLER_LINE_INDEX)?.match(/^ {4}at .+? \((.+?):\d+:\d+\)$/);
    const parentPath = callStackMatch?.[1] ?? null;

    if (parentPath?.includes('<anonymous>')) {
      return null;
    }

    return parentPath;
  }

  private async getRootDirAsync(cwd: string): Promise<null | string> {
    let currentDir = toPosixPath(cwd);
    while (currentDir !== '.' && currentDir !== '/') {
      if (await this.existsAsync(this.getPackageJsonPath(currentDir))) {
        return toPosixPath(currentDir);
      }
      currentDir = dirname(currentDir);
    }
    return null;
  }

  private async getRootDirsAsync(dir: string): Promise<string[]> {
    const modulesRootDir = this.plugin.settingsCopy.modulesRoot ? join(this.vaultAbsolutePath, this.plugin.settingsCopy.modulesRoot) : null;
    return [await this.getRootDirAsync(dir), modulesRootDir].filter((dir): dir is string => dir !== null);
  }

  private async readPackageJsonAsync(path: string): Promise<PackageJson> {
    const content = await this.readFileAsync(path);
    return JSON.parse(content) as PackageJson;
  }

  private require(id: string, options: Partial<RequireOptions> = {}): unknown {
    const DEFAULT_OPTIONS: RequireOptions = {
      cacheInvalidationMode: CacheInvalidationMode.WhenPossible
    };
    const fullOptions = {
      ...DEFAULT_OPTIONS,
      ...options
    };
    const cleanId = splitQuery(id).cleanStr;
    const specialModule = this.requireSpecialModule(cleanId);
    if (specialModule) {
      return specialModule;
    }

    const { resolvedId, resolvedType } = this.resolve(id, fullOptions.parentPath);

    let cleanResolvedId: string;
    let query: string;

    if (resolvedType !== ResolvedType.Url) {
      ({ cleanStr: cleanResolvedId, query } = splitQuery(resolvedId));
    } else {
      cleanResolvedId = resolvedId;
      query = '';
    }

    const hasCachedModule = Object.prototype.hasOwnProperty.call(this.modulesCache, resolvedId);

    if (hasCachedModule) {
      const cachedModule = this.modulesCache[resolvedId]?.exports as unknown;

      switch (fullOptions.cacheInvalidationMode) {
        case CacheInvalidationMode.Never:
          return cachedModule;
        case CacheInvalidationMode.WhenPossible:
          if (query) {
            return cachedModule;
          }

          if (!this.canRequireNonCached(resolvedType)) {
            console.warn(`Cached module ${resolvedId} cannot be invalidated synchronously. The cached version will be used. `);
            return cachedModule;
          }
      }
    }

    if (!this.canRequireNonCached(resolvedType)) {
      throw new Error(`Cannot require '${resolvedId}' synchronously.
${this.getRequireAsyncAdvice(true)}`);
    }

    const module = this.requireNonCached(cleanResolvedId, resolvedType, fullOptions.cacheInvalidationMode);
    this.addToModuleCache(cleanResolvedId, module);
    this.addToModuleCache(resolvedId, module);
    return module;
  }

  private async requireAsync(id: string, options: Partial<RequireOptions> = {}): Promise<unknown> {
    const DEFAULT_OPTIONS: RequireOptions = {
      cacheInvalidationMode: CacheInvalidationMode.WhenPossible
    };
    const fullOptions = {
      ...DEFAULT_OPTIONS,
      ...options
    };
    const cleanId = splitQuery(id).cleanStr;
    const specialModule = this.requireSpecialModule(cleanId);
    if (specialModule) {
      return specialModule;
    }

    const { resolvedId, resolvedType } = this.resolve(id, fullOptions.parentPath);

    let cleanResolvedId: string;
    let query: string;

    if (resolvedType !== ResolvedType.Url) {
      ({ cleanStr: cleanResolvedId, query } = splitQuery(resolvedId));
    } else {
      cleanResolvedId = resolvedId;
      query = '';
    }

    const hasCachedModule = Object.prototype.hasOwnProperty.call(this.modulesCache, resolvedId);

    if (hasCachedModule) {
      switch (fullOptions.cacheInvalidationMode) {
        case CacheInvalidationMode.Never:
          return this.modulesCache[resolvedId];
        case CacheInvalidationMode.WhenPossible:
          if (query) {
            return this.modulesCache[resolvedId];
          }
      }
    }

    const module = await this.requireNonCachedAsync(cleanResolvedId, resolvedType, fullOptions.cacheInvalidationMode);
    this.addToModuleCache(cleanResolvedId, module);
    this.addToModuleCache(resolvedId, module);
    return module;
  }

  private async requireAsyncWrapper<T>(requireFn: (require: RequireExFn) => MaybePromise<T>): Promise<T> {
    const requireArgsList = extractRequireArgsList(requireFn.toString());
    for (const requireArgs of requireArgsList) {
      const { id, options } = requireArgs;
      await this.requireAsync(id, options);
    }
    return await requireFn(this.requireWithCacheWithoutInvalidation);
  }

  private async requireModuleAsync(moduleName: string, parentDir: string, cacheInvalidationMode: CacheInvalidationMode): Promise<unknown> {
    for (const rootDir of await this.getRootDirsAsync(parentDir)) {
      const packageDir = join(rootDir, 'node_modules', moduleName);
      if (!await this.existsAsync(packageDir)) {
        continue;
      }

      const packageJsonPath = this.getPackageJsonPath(packageDir);
      if (!await this.existsAsync(packageJsonPath)) {
        continue;
      }

      const packageJson = await this.readPackageJsonAsync(packageJsonPath);
      const entryPoint = this.findEntryPoint(packageJson);
      const entryPointPath = join(packageDir, entryPoint);
      return this.requirePathAsync(entryPointPath, cacheInvalidationMode);
    }

    throw new Error(`Could not resolve module: ${moduleName}`);
  }

  private async requireNonCachedAsync(id: string, type: ResolvedType, cacheInvalidationMode: CacheInvalidationMode): Promise<unknown> {
    switch (type) {
      case ResolvedType.Module: {
        const [parentDir = '', moduleName = ''] = id.split(MODULE_NAME_SEPARATOR);
        return this.requireModuleAsync(moduleName, parentDir, cacheInvalidationMode);
      }
      case ResolvedType.Path:
        return this.requirePathAsync(id, cacheInvalidationMode);
      case ResolvedType.Url:
        return this.requireUrlAsync(id);
    }
  }

  private async requirePathAsync(path: string, cacheInvalidationMode: CacheInvalidationMode): Promise<unknown> {
    if (!await this.existsAsync(path)) {
      throw new Error(`File not found: ${path}`);
    }

    await this.checkTimestampChangedAndReloadIfNeededAsync(path, cacheInvalidationMode);
    return this.modulesCache[path]?.exports;
  }

  private async requireStringAsync(content: string, path: string): Promise<unknown> {
    const fileName = isUrl(path) ? 'from-url.ts' : basename(path);
    const { code: contentCommonJs, error } = transformToCommonJs(fileName, content);
    if (error) {
      throw new Error(`Failed to transform module to CommonJS: ${path}`, { cause: error });
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const moduleFnAsync = new Function('require', 'module', 'exports', `return requireAsyncWrapper(async (require) => {\n${contentCommonJs ?? ''}\n});`) as ModuleFnAsync;
      const exports = {};
      const module = { exports };
      const childRequire = this.makeChildRequire(path);
      await moduleFnAsync(childRequire, module, exports);
      this.addToModuleCache(path, exports);
      return exports;
    } catch (e) {
      throw new Error(`Failed to load module: ${path}`, { cause: e });
    }
  }

  private async requireUrlAsync(url: string): Promise<unknown> {
    const response = await requestUrl(url);
    return this.requireStringAsync(response.text, url);
  }

  private requireWithoutInvalidation(id: string, options: Partial<RequireOptions> = {}): unknown {
    const optionsWithoutInvalidation = {
      ...options,
      cacheInvalidationMode: CacheInvalidationMode.Never
    };
    return this.require(id, optionsWithoutInvalidation);
  }
}

export function requireVaultScriptAsync(id: string): Promise<unknown> {
  if (!window.requireAsync) {
    throw new Error('requireAsync is not available');
  }

  return window.requireAsync(VAULT_ROOT_PREFIX + id);
}

function splitQuery(str: string): SplitQueryResult {
  const queryIndex = str.indexOf('?');
  return {
    cleanStr: queryIndex !== -1 ? str.slice(0, queryIndex) : str,
    query: queryIndex !== -1 ? str.slice(queryIndex) : ''
  };
}
