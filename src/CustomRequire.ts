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

import { builtInModuleNames } from './BuiltInModuleNames.ts';

export type PluginRequireFn = (id: string) => unknown;

export interface RequireOptions {
  cacheInvalidationMode: 'always' | 'never' | 'whenPossible';
  parentPath?: string;
}

export type ResolvedType = 'module' | 'path' | 'url';

interface ResolvedId {
  id: string;
  type: ResolvedType;
}

interface SplitQueryResult {
  cleanStr: string;
  query: string;
}

export const MODULE_NAME_SEPARATOR = '*';

export abstract class CustomRequire {
  protected originalRequire!: NodeRequire;
  protected plugin!: FixRequireModulesPlugin;
  protected requireWithCache!: RequireExFn;
  protected vaultAbsolutePath!: string;
  private moduleDependencies = new Map<string, Set<string>>();
  private modulesCache!: NodeJS.Dict<NodeModule>;
  private moduleTimestamps = new Map<string, number>();
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

  protected abstract canRequireSync(type: ResolvedType): boolean;

  protected requireSpecialModule(id: string): unknown {
    if (id === 'obsidian/app') {
      return this.plugin.app;
    }

    if (builtInModuleNames.includes(id)) {
      return this.pluginRequire(id);
    }

    return null;
  }

  protected abstract requireSync(id: string, type: ResolvedType): unknown;

  private addToCacheAndReturn(id: string, module: unknown): unknown {
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
    return module;
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
      cacheInvalidationMode: 'whenPossible'
    };
    options = {
      ...DEFAULT_OPTIONS,
      ...options
    };
    const cleanId = splitQuery(id).cleanStr;
    const specialModule = this.requireSpecialModule(cleanId);
    if (specialModule) {
      return specialModule;
    }

    const { id: resolvedId, type } = this.resolve(id, options.parentPath);
    const { cleanStr: cleanResolvedId, query } = splitQuery(resolvedId);
    const hasCachedModule = Object.prototype.hasOwnProperty.call(this.modulesCache, resolvedId);

    if (hasCachedModule) {
      switch (options.cacheInvalidationMode) {
        case 'never':
          return this.modulesCache[resolvedId];
        case 'whenPossible':
          if (query) {
            return this.modulesCache[resolvedId];
          }

          if (!this.canRequireSync(type)) {
            console.warn(`Using cached module ${resolvedId} and it cannot be invalidated when cacheInvalidationMode=whenPossible. Consider using cacheInvalidationMode=always if you need ensure you are using the latest version of the module.`);
            return this.modulesCache[resolvedId];
          }
      }
    }

    if (!this.canRequireSync(type)) {
      throw new Error(`Cannot require '${resolvedId}' synchronously.\nConsider using\nawait requireAsync('${resolvedId}');\nor\nawait requireAsyncWrapper((require) => {\n  // your code\n});`);
    }

    const module = this.requireSync(cleanResolvedId, type);
    this.addToCacheAndReturn(cleanResolvedId, module);
    return this.addToCacheAndReturn(resolvedId, module);
  }

  private async requireAsync(id: string, options: Partial<RequireOptions> = {}): Promise<unknown> {
    // eslint-disable-next-line import-x/no-dynamic-require
    return await this.requireAsyncWrapper((require) => require(id, options));
  }

  private async requireAsyncWrapper<T>(requireFn: (require: RequireExFn) => MaybePromise<T>): Promise<T> {
    return await requireFn(this.requireWithCache);
  }

  private resolve(id: string, parentPath?: string): ResolvedId {
    id = toPosixPath(id);

    if (isUrl(id)) {
      const FILE_URL_PREFIX = 'file:///';
      if (id.toLowerCase().startsWith(FILE_URL_PREFIX)) {
        return { id: id.slice(FILE_URL_PREFIX.length), type: 'path' };
      }

      if (id.toLowerCase().startsWith(Platform.resourcePathPrefix)) {
        return { id: id.slice(Platform.resourcePathPrefix.length), type: 'path' };
      }

      return { id: id, type: 'url' };
    }

    const VAULT_ROOT_PREFIX = '//';

    if (id.startsWith(VAULT_ROOT_PREFIX)) {
      return { id: join(this.vaultAbsolutePath, trimStart(id, VAULT_ROOT_PREFIX)), type: 'path' };
    }

    const MODULES_ROOT_PATH_PREFIX = '/';
    if (id.startsWith(MODULES_ROOT_PATH_PREFIX)) {
      return { id: join(this.vaultAbsolutePath, this.plugin.settingsCopy.modulesRoot, trimStart(id, MODULES_ROOT_PATH_PREFIX)), type: 'path' };
    }

    if (isAbsolute(id)) {
      return { id, type: 'path' };
    }

    parentPath = parentPath ? toPosixPath(parentPath) : this.getParentPathFromCallStack() ?? this.plugin.app.workspace.getActiveFile()?.path ?? 'fakeRoot.js';
    if (!isAbsolute(parentPath)) {
      parentPath = join(this.vaultAbsolutePath, parentPath);
    }
    const parentDir = dirname(parentPath);

    if (id.startsWith('./') || !id.startsWith('../')) {
      return { id: join(parentDir, id), type: 'path' };
    }

    return { id: `${parentDir}${MODULE_NAME_SEPARATOR}${id}`, type: 'module' };
  }
}

function splitQuery(str: string): SplitQueryResult {
  const queryIndex = str.indexOf('?');
  return {
    cleanStr: queryIndex !== -1 ? str.slice(0, queryIndex) : str,
    query: queryIndex !== -1 ? str.slice(queryIndex) : ''
  };
}
