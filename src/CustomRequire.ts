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

import type { FileSystemWrapper } from './FileSystemWrapper.ts';
import type { FixRequireModulesPlugin } from './FixRequireModulesPlugin.ts';
import type { RequireHandler } from './RequireHandler.ts';
import type { RequireExFn } from './types.js';

import { builtInModuleNames } from './BuiltInModuleNames.ts';
import { getPlatformDependencies } from './PlatformDependencies.ts';

export interface CustomRequireOptions {
  cacheInvalidationMode: 'always' | 'never' | 'whenPossible';
  parentPath?: string;
}

type PluginRequireFn = (id: string) => unknown;

interface ResolvedId {
  id: string;
  type: 'module' | 'path' | 'url';
}

interface SplitQueryResult {
  cleanStr: string;
  query: string;
}

let fileSystemWrapper: FileSystemWrapper;
let plugin!: FixRequireModulesPlugin;
let pluginRequire!: PluginRequireFn;
let originalRequire: NodeRequire;
let requireHandler: RequireHandler;
let customRequireWithCache: RequireExFn;
let vaultAbsolutePath: string;

const moduleTimestamps = new Map<string, number>();
const updatedModuleTimestamps = new Map<string, number>();
const moduleDependencies = new Map<string, Set<string>>();
let modulesCache: NodeJS.Dict<NodeModule>;

export function clearCache(): void {
  moduleTimestamps.clear();
  updatedModuleTimestamps.clear();
  moduleDependencies.clear();

  for (const key of Object.keys(modulesCache)) {
    if (key.startsWith('electron') || key.includes('app.asar')) {
      continue;
    }

    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete modulesCache[key];
  }
}

export function customRequire(id: string, options: Partial<CustomRequireOptions> = {}): unknown {
  const DEFAULT_OPTIONS: CustomRequireOptions = {
    cacheInvalidationMode: 'whenPossible'
  };
  options = {
    ...DEFAULT_OPTIONS,
    ...options
  };
  const specialModule = requireSpecialModule(id);
  if (specialModule) {
    return specialModule;
  }

  const { id: resolvedId, type } = resolve(id, options.parentPath);
  const hasCachedModule = Object.prototype.hasOwnProperty.call(modulesCache, resolvedId);

  if (hasCachedModule) {
    switch (options.cacheInvalidationMode) {
      case 'never':
        return modulesCache[resolvedId];
      case 'whenPossible':
        if (type === 'url' || !fileSystemWrapper.hasSyncMethods) {
          console.warn(`Using cached module ${resolvedId} and it cannot be invalidated when cacheInvalidationMode=whenPossible. Consider using cacheInvalidationMode=always if you need ensure you are using the latest version of the module.`);
          return modulesCache[resolvedId];
        }
    }
  }

  if (!fileSystemWrapper.hasSyncMethods) {
    throw new Error(`Cannot resolve module '${resolvedId}'\nConsider using\nawait dynamicImport('${resolvedId}');\nor\nawait requireWrapper((require) => {\n  // your code\n});`);
  }

  if (type === 'module') {
    // TODO
  }

  const module = null;
  return addToCacheAndReturn(resolvedId, module);
}

export async function registerCustomRequire(plugin_: FixRequireModulesPlugin, pluginRequire_: PluginRequireFn): Promise<void> {
  plugin = plugin_;
  pluginRequire = pluginRequire_;

  vaultAbsolutePath = toPosixPath(plugin.app.vault.adapter.basePath);

  const platformDependencies = await getPlatformDependencies();
  fileSystemWrapper = platformDependencies.fileSystemWrapper;
  fileSystemWrapper.register(plugin.app);

  originalRequire = window.require;
  requireHandler = platformDependencies.requireHandler;

  customRequireWithCache = Object.assign(customRequire, {
    cache: {}
  }, originalRequire);
  modulesCache = customRequireWithCache.cache;

  window.require = customRequireWithCache;
  plugin.register(() => window.require = originalRequire);
  requireHandler.register(plugin, originalRequire, customRequireWithCache);

  window.dynamicImport = dynamicImport;
  plugin.register(() => delete window.dynamicImport);

  window.requireWrapper = requireWrapper;
  plugin.register(() => delete window.requireWrapper);
}

function addToCacheAndReturn(id: string, module: unknown): unknown {
  modulesCache[id] = {
    children: [],
    exports: module,
    filename: '',
    id,
    isPreloading: false,
    loaded: true,
    parent: null,
    path: '',
    paths: [],
    require: customRequireWithCache
  };
  return module;
}

async function dynamicImport(id: string, options: Partial<CustomRequireOptions> = {}): Promise<unknown> {
  // eslint-disable-next-line import-x/no-dynamic-require
  return await requireWrapper((require) => require(id, options));
}

function getParentPathFromCallStack(): null | string {
  /**
 * The caller line index is 3 because the call stack is as follows:
 *
 * 0: Error
 * 1:     at getParentPathFromCallerStack
 * 2:     at at Module.customRequire [as require]
 * 3:     at functionName (path/to/caller.js:123:45)
 */
  const CALLER_LINE_INDEX = 3;
  const callStackLines = new Error().stack?.split('\n') ?? [];
  console.debug('callStackLines', { callStackLines });
  const callStackMatch = callStackLines.at(CALLER_LINE_INDEX)?.match(/^ {4}at .+? \((.+?):\d+:\d+\)$/);
  return callStackMatch?.[1] ?? null;
}

function requireSpecialModule(id: string): unknown {
  const cleanId = splitQuery(id).cleanStr;
  if (cleanId === 'obsidian/app') {
    return addToCacheAndReturn(id, plugin.app);
  }

  if (builtInModuleNames.includes(cleanId)) {
    return addToCacheAndReturn(id, pluginRequire(cleanId));
  }

  const module = requireHandler.requireSpecialModule(id);
  if (module) {
    return addToCacheAndReturn(id, module);
  }

  return null;
}

async function requireWrapper<T>(requireFn: (require: RequireExFn) => MaybePromise<T>): Promise<T> {
  return await requireFn(customRequireWithCache);
}

function resolve(id: string, parentPath?: string): ResolvedId {
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
    return { id: join(vaultAbsolutePath, trimStart(id, VAULT_ROOT_PREFIX)), type: 'path' };
  }

  const MODULES_ROOT_PATH_PREFIX = '/';
  if (id.startsWith(MODULES_ROOT_PATH_PREFIX)) {
    return { id: join(vaultAbsolutePath, plugin.settingsCopy.modulesRoot, trimStart(id, MODULES_ROOT_PATH_PREFIX)), type: 'path' };
  }

  if (isAbsolute(id)) {
    return { id, type: 'path' };
  }

  parentPath = parentPath ? toPosixPath(parentPath) : getParentPathFromCallStack() ?? plugin.app.workspace.getActiveFile()?.path ?? 'fakeRoot.js';
  if (!isAbsolute(parentPath)) {
    parentPath = join(vaultAbsolutePath, parentPath);
  }
  const parentDir = dirname(parentPath);

  if (id.startsWith('./') || !id.startsWith('../')) {
    return { id: join(parentDir, id), type: 'path' };
  }

  return { id: `${parentDir}*${id}`, type: 'module' };
}

function splitQuery(str: string): SplitQueryResult {
  const queryIndex = str.indexOf('?');
  return {
    cleanStr: queryIndex !== -1 ? str.slice(0, queryIndex) : str,
    query: queryIndex !== -1 ? str.slice(queryIndex) : ''
  };
}
