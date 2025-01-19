import type { MaybePromise } from 'obsidian-dev-utils/Async';
import type { PackageJson } from 'obsidian-dev-utils/scripts/Npm';

import { debuggableEval } from 'debuggable-eval';
import { Platform } from 'obsidian';
import { normalizeOptionalProperties } from 'obsidian-dev-utils/Object';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  toPosixPath
} from 'obsidian-dev-utils/Path';
import {
  replaceAll,
  trimEnd,
  trimStart
} from 'obsidian-dev-utils/String';
import { isUrl } from 'obsidian-dev-utils/url';

import type { CodeScriptToolkitPlugin } from './CodeScriptToolkitPlugin.ts';

import { SequentialBabelPlugin } from './babel/CombineBabelPlugins.ts';
import { ConvertToCommonJsBabelPlugin } from './babel/ConvertToCommonJsBabelPlugin.ts';
import { ExtractRequireArgsListBabelPlugin } from './babel/ExtractRequireArgsListBabelPlugin.ts';
import { FixSourceMapBabelPlugin } from './babel/FixSourceMapBabelPlugin.ts';
import { WrapInRequireFunctionBabelPlugin } from './babel/WrapInRequireFunctionBabelPlugin.ts';
import { builtInModuleNames } from './BuiltInModuleNames.ts';
import {
  CachedModuleProxyHandler,
  EMPTY_MODULE_SYMBOL
} from './CachedModuleProxyHandler.ts';
import { CacheInvalidationMode } from './CacheInvalidationMode.ts';

export enum ResolvedType {
  Module = 'module',
  Path = 'path',
  Url = 'url'
}

export type PluginRequireFn = (id: string) => unknown;
export type RequireAsyncWrapperFn = (requireFn: RequireAsyncWrapperArg) => Promise<unknown>;

export interface RequireOptions {
  cacheInvalidationMode: CacheInvalidationMode;
  parentPath?: string;
}

interface EmptyModule {
  [EMPTY_MODULE_SYMBOL]: boolean;
}

type ModuleFnWrapper = (require: NodeRequire, module: { exports: unknown }, exports: unknown, requireAsyncWrapper: RequireAsyncWrapperFn) => MaybePromise<void>;
type RequireAsyncFn = (id: string, options?: Partial<RequireOptions>) => Promise<unknown>;
type RequireAsyncWrapperArg = (require: RequireExFn) => MaybePromise<unknown>;

type RequireExFn = { parentPath?: string } & NodeRequire & RequireFn;

type RequireFn = (id: string, options: Partial<RequireOptions>) => unknown;

interface RequireWindow {
  require?: RequireExFn;
  requireAsync?: RequireAsyncFn;
  requireAsyncWrapper?: RequireAsyncWrapperFn;
}

interface ResolveResult {
  resolvedId: string;
  resolvedType: ResolvedType;
}

interface SplitQueryResult {
  cleanStr: string;
  query: string;
}

interface WrapRequireOptions {
  beforeRequire?: (id: string) => void;
  optionsToAppend?: Partial<RequireOptions>;
  optionsToPrepend?: Partial<RequireOptions>;
  require: RequireExFn;
}

export const ENTRY_POINT = '.';
export const EXTENSIONS = ['.js', '.cjs', '.mjs', '.ts', '.cts', '.mts'];
export const MODULE_NAME_SEPARATOR = '*';
export const NODE_MODULES_DIR = 'node_modules';
const PACKAGE_JSON = 'package.json';
export const PATH_SUFFIXES = ['', ...EXTENSIONS, ...EXTENSIONS.map((ext) => `/index${ext}`)];
export const PRIVATE_MODULE_PREFIX = '#';
export const RELATIVE_MODULE_PATH_SEPARATOR = '/';
export const SCOPED_MODULE_PREFIX = '@';
const WILDCARD_MODULE_CONDITION_SUFFIX = '/*';
export const VAULT_ROOT_PREFIX = '//';

interface RequireStringImplOptions {
  code: string;
  evalPrefix: string;
  path: string;
  shouldWrapInAsyncFunction: boolean;
  urlSuffix: string;
}

interface RequireStringImplResult {
  exportsFn: () => unknown;
  maybePromise: MaybePromise<void>;
}

export abstract class RequireHandler {
  protected readonly currentModulesTimestampChain = new Set<string>();
  protected readonly moduleDependencies = new Map<string, Set<string>>();
  protected modulesCache!: NodeJS.Dict<NodeModule>;
  protected readonly moduleTimestamps = new Map<string, number>();
  protected originalRequire!: NodeRequire;
  protected plugin!: CodeScriptToolkitPlugin;
  protected requireEx!: RequireExFn;
  protected vaultAbsolutePath!: string;
  private pluginRequire!: PluginRequireFn;

  public clearCache(): void {
    this.moduleTimestamps.clear();
    this.currentModulesTimestampChain.clear();
    this.moduleDependencies.clear();

    for (const key of Object.keys(this.modulesCache)) {
      if (key.startsWith('electron') || key.includes('app.asar')) {
        continue;
      }

      this.deleteCacheEntry(key);
    }
  }

  public register(plugin: CodeScriptToolkitPlugin, pluginRequire: PluginRequireFn): void {
    this.plugin = plugin;
    this.pluginRequire = pluginRequire;
    this.vaultAbsolutePath = toPosixPath(plugin.app.vault.adapter.basePath);
    this.originalRequire = window.require;

    this.requireEx = Object.assign(this.require.bind(this), {
      cache: {}
    }, this.originalRequire) as RequireExFn;
    this.modulesCache = this.requireEx.cache;

    const requireWindow = window as Partial<RequireWindow>;

    requireWindow.require = this.requireEx;
    plugin.register(() => requireWindow.require = this.originalRequire);

    requireWindow.requireAsync = this.requireAsync.bind(this);
    plugin.register(() => delete requireWindow.requireAsync);

    requireWindow.requireAsyncWrapper = this.requireAsyncWrapper.bind(this);
    plugin.register(() => delete requireWindow.requireAsyncWrapper);
  }

  public async requireAsync(id: string, options: Partial<RequireOptions> = {}): Promise<unknown> {
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

    const cachedModuleEntry = this.modulesCache[resolvedId];

    if (cachedModuleEntry) {
      if (!cachedModuleEntry.loaded) {
        console.warn(`Circular dependency detected: ${resolvedId} -> ... -> ${fullOptions.parentPath ?? ''} -> ${resolvedId}`);
        return cachedModuleEntry.exports;
      }

      if (this.currentModulesTimestampChain.has(resolvedId)) {
        return cachedModuleEntry.exports;
      }

      switch (fullOptions.cacheInvalidationMode) {
        case CacheInvalidationMode.Never:
          return cachedModuleEntry.exports;
        case CacheInvalidationMode.WhenPossible:
          if (query) {
            return cachedModuleEntry.exports;
          }
      }
    }

    const module = await this.initModuleAndAddToCacheAsync(cleanResolvedId, () => this.requireNonCachedAsync(cleanResolvedId, resolvedType, fullOptions.cacheInvalidationMode));
    if (resolvedId !== cleanResolvedId) {
      this.initModuleAndAddToCache(resolvedId, () => module);
    }
    return module;
  }

  public async requireStringAsync(code: string, path: string, urlSuffix?: string): Promise<unknown> {
    if (this.isJson(path)) {
      return JSON.parse(code);
    }

    urlSuffix = urlSuffix ? `/${urlSuffix}` : '';

    try {
      return await this.initModuleAndAddToCacheAsync(path, async () => {
        const result = this.requireStringImpl({
          code,
          evalPrefix: 'requireStringAsync',
          path,
          shouldWrapInAsyncFunction: true,
          urlSuffix
        });
        await result.maybePromise;
        return result.exportsFn();
      });
    } catch (e) {
      throw new Error(`Failed to load module: ${path}`, { cause: e });
    }
  }

  protected abstract canRequireNonCached(type: ResolvedType): boolean;

  protected abstract existsDirectoryAsync(path: string): Promise<boolean>;

  protected abstract existsFileAsync(path: string): Promise<boolean>;

  protected getCachedModule(id: string): unknown {
    return this.modulesCache[id]?.loaded ? this.modulesCache[id].exports : null;
  }

  protected getPackageJsonPath(packageDir: string): string {
    return join(packageDir, PACKAGE_JSON);
  }

  protected getRelativeModulePaths(packageJson: PackageJson, relativeModuleName: string): string[] {
    const isPrivateModule = relativeModuleName.startsWith(PRIVATE_MODULE_PREFIX);
    const importsExportsNode = isPrivateModule ? packageJson.imports : packageJson.exports;
    const paths = this.getExportsRelativeModulePaths(importsExportsNode, relativeModuleName);

    if (relativeModuleName === ENTRY_POINT) {
      paths.push(packageJson.main ?? ENTRY_POINT);
    }

    if (!importsExportsNode && !isPrivateModule) {
      paths.push(relativeModuleName);
    }

    return paths;
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

  protected handleCodeWithTopLevelAwait(_path: string): void {
    return;
  }

  protected initModuleAndAddToCache(id: string, moduleInitializer: () => unknown): unknown {
    if (!this.modulesCache[id] || this.modulesCache[id].loaded) {
      this.deleteCacheEntry(id);
      this.addToModuleCache(id, this.createEmptyModule(id), false);
    }
    try {
      const module = moduleInitializer();
      const cachedModule = this.getCachedModule(id);
      if (cachedModule) {
        return cachedModule;
      }
      if (!this.isEmptyModule(module)) {
        this.addToModuleCache(id, module);
      }

      return module;
    } catch (e) {
      this.deleteCacheEntry(id);
      throw e;
    }
  }

  protected async initModuleAndAddToCacheAsync(id: string, moduleInitializer: () => Promise<unknown>): Promise<unknown> {
    if (!this.modulesCache[id] || this.modulesCache[id].loaded) {
      this.deleteCacheEntry(id);
      this.addToModuleCache(id, this.createEmptyModule(id), false);
    }
    try {
      const module = await moduleInitializer();
      const cachedModule = this.getCachedModule(id);
      if (cachedModule) {
        return cachedModule;
      }
      if (!this.isEmptyModule(module)) {
        this.addToModuleCache(id, module);
      }
      return module;
    } catch (e) {
      this.deleteCacheEntry(id);
      throw e;
    }
  }

  protected isJson(path: string): boolean {
    return splitQuery(path).cleanStr.endsWith('.json');
  }

  protected makeChildRequire(parentPath: string): RequireExFn {
    return this.wrapRequire({
      beforeRequire: (id: string): void => {
        let dependencies = this.moduleDependencies.get(parentPath);
        if (!dependencies) {
          dependencies = new Set<string>();
          this.moduleDependencies.set(parentPath, dependencies);
        }
        dependencies.add(id);
      },
      optionsToPrepend: { parentPath },
      require: this.requireEx
    });
  }

  protected abstract readFileAsync(path: string): Promise<string>;

  protected async requireAsyncWrapper(requireFn: (require: RequireExFn) => MaybePromise<unknown>, require?: RequireExFn): Promise<unknown> {
    const result = new ExtractRequireArgsListBabelPlugin().transform(requireFn.toString(), 'extract-requires.js');
    const requireArgsList = result.data.requireArgsList;
    for (const requireArgs of requireArgsList) {
      const { id, options } = requireArgs;
      const newOptions = normalizeOptionalProperties<Partial<RequireOptions>>({ parentPath: require?.parentPath, ...options });
      await this.requireAsync(id, newOptions);
    }
    return await requireFn(this.wrapRequire({
      optionsToAppend: { cacheInvalidationMode: CacheInvalidationMode.Never },
      require: require ?? this.requireEx
    }));
  }

  protected abstract requireNonCached(id: string, type: ResolvedType, cacheInvalidationMode: CacheInvalidationMode): unknown;

  protected requireSpecialModule(id: string): unknown {
    if (id === 'obsidian/app') {
      return this.plugin.app;
    }

    if (id === 'obsidian/builtInModuleNames') {
      return builtInModuleNames;
    }

    if (builtInModuleNames.includes(id)) {
      return this.pluginRequire(id);
    }

    return null;
  }

  protected requireStringImpl(options: RequireStringImplOptions): RequireStringImplResult {
    const dir = isUrl(options.path) ? '' : dirname(options.path);
    const filename = isUrl(options.path) ? options.path : basename(options.path);
    const url = convertPathToObsidianUrl(options.path) + options.urlSuffix;

    const transformResult = new SequentialBabelPlugin([
      new ConvertToCommonJsBabelPlugin(),
      new WrapInRequireFunctionBabelPlugin(options.shouldWrapInAsyncFunction),
      new FixSourceMapBabelPlugin(url)
    ]).transform(options.code, filename, dir);

    if (transformResult.error) {
      throw new Error(`Failed to transform code from: ${options.path}`, { cause: transformResult.error });
    }

    if (transformResult.data.hasTopLevelAwait) {
      this.handleCodeWithTopLevelAwait(options.path);
    }

    const moduleFnWrapper = debuggableEval(transformResult.transformedCode, `${options.evalPrefix}/${options.path}${options.urlSuffix}`) as ModuleFnWrapper;
    const module = { exports: {} };
    const childRequire = this.makeChildRequire(options.path);
    // eslint-disable-next-line import-x/no-commonjs
    const maybePromise = moduleFnWrapper(childRequire, module, module.exports, this.requireAsyncWrapper.bind(this));
    return {
      // eslint-disable-next-line import-x/no-commonjs
      exportsFn: () => module.exports,
      maybePromise
    };
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

    const SYSTEM_ROOT_PATH_PREFIX = '~/';
    if (id.startsWith(SYSTEM_ROOT_PATH_PREFIX)) {
      return { resolvedId: '/' + trimStart(id, SYSTEM_ROOT_PATH_PREFIX), resolvedType: ResolvedType.Path };
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

  private addToModuleCache(id: string, module: unknown, isLoaded = true): NodeModule {
    return this.modulesCache[id] = {
      children: [],
      exports: module,
      filename: '',
      id,
      isPreloading: false,
      loaded: isLoaded,
      parent: null,
      path: '',
      paths: [],
      require: this.requireEx
    };
  }

  private applyCondition(condition: string, exportsNodeChild: PackageJson.Exports, relativeModuleName: string): string[] {
    if (condition === 'types') {
      return [];
    }

    if (condition === relativeModuleName) {
      return this.getExportsRelativeModulePaths(exportsNodeChild, ENTRY_POINT);
    }

    if (!condition.startsWith(ENTRY_POINT)) {
      return this.getExportsRelativeModulePaths(exportsNodeChild, relativeModuleName);
    }

    if (condition.endsWith(WILDCARD_MODULE_CONDITION_SUFFIX)) {
      const parentCondition = trimEnd(condition, WILDCARD_MODULE_CONDITION_SUFFIX);
      const separatorIndex = relativeModuleName.lastIndexOf(RELATIVE_MODULE_PATH_SEPARATOR);
      const parentRelativeModuleName = separatorIndex !== -1 ? relativeModuleName.slice(0, separatorIndex) : relativeModuleName;
      const leafRelativeModuleName = separatorIndex !== -1 ? relativeModuleName.slice(separatorIndex + 1) : '';

      if (parentCondition === parentRelativeModuleName && leafRelativeModuleName) {
        return this.getExportsRelativeModulePaths(exportsNodeChild, join(ENTRY_POINT, leafRelativeModuleName));
      }
    }

    return [];
  }

  private createEmptyModule(id: string): EmptyModule {
    const loadingModule = {};
    const emptyModule = new Proxy({}, new CachedModuleProxyHandler(() => this.getCachedModule(id) ?? loadingModule));
    return emptyModule as EmptyModule;
  }

  private deleteCacheEntry(id: string): void {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete this.modulesCache[id];
  }

  private async findExistingFilePathAsync(path: string): Promise<null | string> {
    for (const suffix of PATH_SUFFIXES) {
      const newPath = path + suffix;
      if (await this.existsFileAsync(newPath)) {
        return newPath;
      }
    }

    return null;
  }

  private async getDependenciesTimestampChangedAndReloadIfNeededAsync(path: string, cacheInvalidationMode: CacheInvalidationMode): Promise<number> {
    if (this.currentModulesTimestampChain.has(path)) {
      return this.moduleTimestamps.get(path) ?? 0;
    }

    this.currentModulesTimestampChain.add(path);

    const updateTimestamp = (newTimestamp: number): void => {
      timestamp = Math.max(timestamp, newTimestamp);
      this.moduleTimestamps.set(path, timestamp);
    };

    const cachedTimestamp = this.moduleTimestamps.get(path) ?? 0;
    let timestamp = 0;
    updateTimestamp(await this.getTimestampAsync(path));
    const dependencies = this.moduleDependencies.get(path) ?? [];
    for (const dependency of dependencies) {
      const { resolvedId, resolvedType } = this.resolve(dependency, path);
      switch (resolvedType) {
        case ResolvedType.Module:
          for (const rootDir of await this.getRootDirsAsync(path)) {
            const packageJsonPath = this.getPackageJsonPath(rootDir);
            if (!await this.existsFileAsync(packageJsonPath)) {
              continue;
            }

            const dependencyTimestamp = await this.getDependenciesTimestampChangedAndReloadIfNeededAsync(packageJsonPath, cacheInvalidationMode);
            updateTimestamp(dependencyTimestamp);
          }
          break;
        case ResolvedType.Path: {
          const existingFilePath = await this.findExistingFilePathAsync(resolvedId);
          if (existingFilePath == null) {
            throw new Error(`File not found: ${resolvedId}`);
          }

          const dependencyTimestamp = await this.getDependenciesTimestampChangedAndReloadIfNeededAsync(existingFilePath, cacheInvalidationMode);
          updateTimestamp(dependencyTimestamp);
          break;
        }
        case ResolvedType.Url: {
          if (cacheInvalidationMode !== CacheInvalidationMode.Never) {
            updateTimestamp(Date.now());
          }
          break;
        }
      }
    }

    if (timestamp > cachedTimestamp || !this.getCachedModule(path)) {
      const content = await this.readFileAsync(path);
      await this.initModuleAndAddToCacheAsync(path, () => this.requireStringAsync(content, path));
    }
    return timestamp;
  }

  private getExportsRelativeModulePaths(exportsNode: PackageJson.Exports | undefined, relativeModuleName: string): string[] {
    if (!exportsNode) {
      return [];
    }

    if (typeof exportsNode === 'string') {
      let path = exportsNode;

      if (!path.contains(MODULE_NAME_SEPARATOR)) {
        path = join(path, MODULE_NAME_SEPARATOR);
      }

      const resolvedPath = replaceAll(path, MODULE_NAME_SEPARATOR, relativeModuleName);
      return [resolvedPath];
    }

    if (!Array.isArray(exportsNode)) {
      const conditions = exportsNode;
      return Object.entries(conditions)
        .flatMap(([condition, exportsNodeChild]) => this.applyCondition(condition, exportsNodeChild, relativeModuleName));
    }

    const arr = exportsNode;
    return arr.flatMap((exportsNodeChild) => this.getExportsRelativeModulePaths(exportsNodeChild, relativeModuleName));
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
    this.plugin.consoleDebug('callStackLines', { callStackLines });
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
      if (await this.existsFileAsync(this.getPackageJsonPath(currentDir))) {
        return toPosixPath(currentDir);
      }
      currentDir = dirname(currentDir);
    }
    return null;
  }

  private async getRootDirsAsync(dir: string): Promise<string[]> {
    const modulesRootDir = this.plugin.settingsCopy.modulesRoot ? join(this.vaultAbsolutePath, this.plugin.settingsCopy.modulesRoot) : null;

    const ans: string[] = [];
    for (const possibleDir of new Set([dir, modulesRootDir])) {
      if (possibleDir === null) {
        continue;
      }

      const rootDir = await this.getRootDirAsync(possibleDir);
      if (rootDir == null) {
        continue;
      }

      ans.push(rootDir);
    }

    return ans;
  }

  private isEmptyModule(module: unknown): boolean {
    return (module as Partial<EmptyModule> | undefined)?.[EMPTY_MODULE_SYMBOL] === true;
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

    const cachedModuleEntry = this.modulesCache[resolvedId];

    if (cachedModuleEntry) {
      if (!cachedModuleEntry.loaded) {
        console.warn(`Circular dependency detected: ${resolvedId} -> ... -> ${fullOptions.parentPath ?? ''} -> ${resolvedId}`);
        return cachedModuleEntry.exports;
      }

      if (this.currentModulesTimestampChain.has(resolvedId)) {
        return cachedModuleEntry.exports;
      }

      switch (fullOptions.cacheInvalidationMode) {
        case CacheInvalidationMode.Never:
          return cachedModuleEntry.exports;
        case CacheInvalidationMode.WhenPossible:
          if (query) {
            return cachedModuleEntry.exports;
          }

          if (!this.canRequireNonCached(resolvedType)) {
            console.warn(`Cached module ${resolvedId} cannot be invalidated synchronously. The cached version will be used. `);
            return cachedModuleEntry.exports;
          }
      }
    }

    if (!this.canRequireNonCached(resolvedType)) {
      throw new Error(`Cannot require '${resolvedId}' synchronously.
${this.getRequireAsyncAdvice(true)}`);
    }

    const module = this.initModuleAndAddToCache(cleanResolvedId, () => this.requireNonCached(cleanResolvedId, resolvedType, fullOptions.cacheInvalidationMode));
    if (resolvedId !== cleanResolvedId) {
      this.initModuleAndAddToCache(resolvedId, () => module);
    }
    return module;
  }

  private async requireModuleAsync(moduleName: string, parentDir: string, cacheInvalidationMode: CacheInvalidationMode): Promise<unknown> {
    let separatorIndex = moduleName.indexOf(RELATIVE_MODULE_PATH_SEPARATOR);

    if (moduleName.startsWith(SCOPED_MODULE_PREFIX)) {
      if (separatorIndex === -1) {
        throw new Error(`Invalid scoped module name: ${moduleName}`);
      }
      separatorIndex = moduleName.indexOf(RELATIVE_MODULE_PATH_SEPARATOR, separatorIndex + 1);
    }

    const baseModuleName = separatorIndex !== -1 ? moduleName.slice(0, separatorIndex) : moduleName;
    let relativeModuleName = ENTRY_POINT + (separatorIndex !== -1 ? moduleName.slice(separatorIndex) : '');

    for (const rootDir of await this.getRootDirsAsync(parentDir)) {
      let packageDir: string;
      if (moduleName.startsWith(PRIVATE_MODULE_PREFIX) || moduleName === ENTRY_POINT) {
        packageDir = rootDir;
        relativeModuleName = moduleName;
      } else {
        packageDir = join(rootDir, NODE_MODULES_DIR, baseModuleName);
      }

      if (!await this.existsDirectoryAsync(packageDir)) {
        continue;
      }

      const packageJsonPath = this.getPackageJsonPath(packageDir);
      if (!await this.existsFileAsync(packageJsonPath)) {
        continue;
      }

      const packageJson = await this.readPackageJsonAsync(packageJsonPath);
      const relativeModulePaths = this.getRelativeModulePaths(packageJson, relativeModuleName);

      for (const relativeModulePath of relativeModulePaths) {
        const fullModulePath = join(packageDir, relativeModulePath);
        const existingPath = await this.findExistingFilePathAsync(fullModulePath);
        if (!existingPath) {
          continue;
        }

        return this.requirePathAsync(existingPath, cacheInvalidationMode);
      }
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
    const existingFilePath = await this.findExistingFilePathAsync(path);
    if (existingFilePath == null) {
      throw new Error(`File not found: ${path}`);
    }

    const isRootRequire = this.currentModulesTimestampChain.size === 0;

    try {
      await this.getDependenciesTimestampChangedAndReloadIfNeededAsync(existingFilePath, cacheInvalidationMode);
    } finally {
      if (isRootRequire) {
        this.currentModulesTimestampChain.clear();
      }
    }

    return this.modulesCache[existingFilePath]?.exports;
  }

  private async requireUrlAsync(url: string): Promise<unknown> {
    const response = await requestUrl(url);
    return this.requireStringAsync(response.text, url);
  }

  private wrapRequire(options: WrapRequireOptions): RequireExFn {
    const fn = (id: string, requireOptions: Partial<RequireOptions> = {}): unknown => {
      options.beforeRequire?.(id);
      const newOptions = { ...options.optionsToPrepend, ...requireOptions, ...options.optionsToAppend };
      return options.require(id, newOptions);
    };
    return Object.assign(fn, options.require, normalizeOptionalProperties<{ parentPath?: string }>({ parentPath: options.optionsToPrepend?.parentPath })) as RequireExFn;
  }
}

function convertPathToObsidianUrl(path: string): string {
  if (!isAbsolute(path)) {
    return path;
  }

  return Platform.resourcePathPrefix + path.replaceAll('\\', '/');
}

function splitQuery(str: string): SplitQueryResult {
  const queryIndex = str.indexOf('?');
  return {
    cleanStr: queryIndex !== -1 ? str.slice(0, queryIndex) : str,
    query: queryIndex !== -1 ? str.slice(queryIndex) : ''
  };
}
