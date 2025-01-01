import type { MaybePromise } from 'obsidian-dev-utils/Async';

import { Platform } from 'obsidian';
import {
  dirname,
  isAbsolute,
  join,
  toPosixPath
} from 'obsidian-dev-utils/Path';
import { trimStart } from 'obsidian-dev-utils/String';
import { isUrl } from 'obsidian-dev-utils/url';

import type { FixRequireModulesPlugin } from './FixRequireModulesPlugin.ts';
import type { RequireExFn } from './types.js';

import { extractRequireArgsList } from './babel/babelPluginExtractRequireArgsList.ts';
import { builtInModuleNames } from './BuiltInModuleNames.ts';
import { CacheInvalidationMode } from './CacheInvalidationMode.ts';

export enum ResolvedType {
  Module = 'module',
  Path = 'path',
  Url = 'url'
}

export type PluginRequireFn = (id: string) => unknown;

export interface RequireOptions {
  cacheInvalidationMode: CacheInvalidationMode;
  parentPath?: string;
}

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
  protected requireWithCache!: RequireExFn;
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

    this.requireWithCache = Object.assign(this.require.bind(this), {
      cache: {}
    }, this.originalRequire);
    this.modulesCache = this.requireWithCache.cache;

    window.require = this.requireWithCache;
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
      require: this.requireWithCache
    };
  }

  protected abstract canRequireSync(type: ResolvedType): boolean;

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
      switch (fullOptions.cacheInvalidationMode) {
        case CacheInvalidationMode.Never:
          return this.modulesCache[resolvedId];
        case CacheInvalidationMode.WhenPossible:
          if (query) {
            return this.modulesCache[resolvedId];
          }

          if (!this.canRequireSync(resolvedType)) {
            console.warn(`Cached module ${resolvedId} cannot be invalidated synchronously. The cached version will be used. `);
            return this.modulesCache[resolvedId];
          }
      }
    }

    if (!this.canRequireSync(resolvedType)) {
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
    return await requireFn(this.requireWithCache);
  }

  private async requireNonCachedAsync(id: string, resolvedType: ResolvedType, cacheInvalidationMode: CacheInvalidationMode): Promise<unknown> {
    console.log('requireAsyncInternal', id, resolvedType, cacheInvalidationMode);
    await Promise.resolve();
    return null;
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
