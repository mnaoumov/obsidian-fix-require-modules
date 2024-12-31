import { Platform } from 'obsidian';
import { isUrl } from 'obsidian-dev-utils/url';

import type { FixRequireModulesPlugin } from './FixRequireModulesPlugin.ts';
import { join, toPosixPath, isAbsolute, dirname } from 'obsidian-dev-utils/Path';
import { trimStart } from 'obsidian-dev-utils/String';
import { builtInModuleNames } from './BuiltInModuleNames.ts';
import { getPlatformDependencies, type PlatformDependencies } from './PlatformDependencies.ts';

type RequireFn = (id: string) => unknown;

interface SplitQueryResult {
  cleanStr: string;
  query: string;
}

function splitQuery(str: string): SplitQueryResult {
  const queryIndex = str.indexOf('?');
  return {
    cleanStr: queryIndex !== -1 ? str.slice(0, queryIndex) : str,
    query: queryIndex !== -1 ? str.slice(queryIndex) : ''
  };
}

let platformDependencies: PlatformDependencies;
let plugin!: FixRequireModulesPlugin;
let pluginRequire!: RequireFn;
let customRequireWithCache: NodeRequire;
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

export async function registerCustomRequire(plugin_: FixRequireModulesPlugin, pluginRequire_: RequireFn): Promise<void> {
  platformDependencies = await getPlatformDependencies();
  plugin = plugin_;
  pluginRequire = pluginRequire_;

  const originalRequire = window.require;
  customRequireWithCache = Object.assign(customRequire, {
    cache: {}
  }, originalRequire);
  window.require = customRequireWithCache;
  modulesCache = customRequireWithCache.cache;
  plugin.register(() => window.require = originalRequire);

  window.dynamicImport = dynamicImport;
  plugin.register(() => delete window.dynamicImport);
}

declare global {
  interface Window {
    dynamicImport?: typeof dynamicImport;
    require?: typeof customRequire;
  }
}

interface ResolvedId {
  id: string;
  type: 'url' | 'vaultPath' | 'absolutePath' | 'module';
}

function resolve(id: string, parentPath?: string): ResolvedId {
  id = toPosixPath(id);

  if (isUrl(id)) {
    const FILE_URL_PREFIX = 'file:///';
    if (id.toLowerCase().startsWith(FILE_URL_PREFIX)) {
      return { id: id.slice(FILE_URL_PREFIX.length), type: 'absolutePath' };
    }

    if (id.toLowerCase().startsWith(Platform.resourcePathPrefix)) {
      return { id: id.slice(Platform.resourcePathPrefix.length), type: 'absolutePath' };
    }

    return { id: id, type: 'url' };
  }

  const VAULT_ROOT_PREFIX = '//';

  if (id.startsWith(VAULT_ROOT_PREFIX)) {
    return { id: trimStart(id, VAULT_ROOT_PREFIX), type: 'vaultPath' };
  }

  const MODULES_ROOT_PATH_PREFIX = '/';
  if (id.startsWith(MODULES_ROOT_PATH_PREFIX)) {
    return { id: join(plugin.settingsCopy.modulesRoot, trimStart(id, MODULES_ROOT_PATH_PREFIX)), type: 'vaultPath' };
  }

  if (isAbsolute(id)) {
    return { id, type: 'absolutePath' };
  }

  parentPath = parentPath ? toPosixPath(parentPath) : getParentPathFromCallerStack() ?? plugin.app.workspace.getActiveFile()?.path ?? 'fakeRoot.js';



  if (!id.startsWith('./') && !id.startsWith('../')) {
    id = './' + id;
  }

  return { id: join(dirname(parentPath), id), type: isAbsolute(parentPath) ? 'absolutePath' : 'vaultPath' };
}

interface CustomRequireOptions {
  cacheInvalidationMode: 'never' | 'always' | 'whenPossible';
  parentPath?: string;
}

export function customRequire(id: string, options: Partial<CustomRequireOptions> = {}): unknown {
  const DEFAULT_OPTIONS: CustomRequireOptions = {
    cacheInvalidationMode: 'whenPossible',
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
        if (type === 'url' || Platform.isMobileApp) {
          console.warn(`Using cached module ${resolvedId} and it cannot be invalidated when cacheInvalidationMode=whenPossible`);
          return modulesCache[resolvedId];
        }
    }
  }

  if (Platform.isMobileApp) {
    throw new Error(`Cannot require('${resolvedId}')\nConsider using 'dynamicImport' instead.`);
  }

  const module = require(resolvedId);
  return addToCacheAndReturn(resolvedId, module);
}

function requireSpecialModule(id: string): unknown {
  const cleanId = splitQuery(id).cleanStr;
  if (cleanId === 'obsidian/app') {
    return addToCacheAndReturn(id, plugin.app);
  }

  if (builtInModuleNames.includes(cleanId)) {
    return addToCacheAndReturn(id, pluginRequire(cleanId));
  }

  return null;
}

function addToCacheAndReturn(id: string, module: unknown): unknown {
  modulesCache[id] = {
    id,
    exports: {},
    isPreloading: false,
    require: customRequireWithCache,
    path: '',
    paths: [],
    filename: '',
    children: [],
    parent: null,
    loaded: true,
  };
  return module;
}

async function dynamicImport(moduleName: string, currentScriptPath?: string): Promise<unknown> {
  const FILE_URL_PREFIX = 'file:///';
  if (moduleName.toLowerCase().startsWith(FILE_URL_PREFIX)) {
    moduleName = moduleName.slice(FILE_URL_PREFIX.length);
  } else if (moduleName.toLowerCase().startsWith(Platform.resourcePathPrefix)) {
    moduleName = moduleName.slice(Platform.resourcePathPrefix.length);
  } else if (isUrl(moduleName)) {
    return await import(moduleName) as unknown;
  }

  return customRequire(moduleName, currentScriptPath);
}

function getParentPathFromCallerStack(): string | null {
  /**
 * The caller line index is 3 because the call stack is as follows:
 *
 * 0: Error
 * 1:     at getCurrentScriptFullPath
 * 2:     at getParentPathFromCallerStack
 * 3:     at functionName (path/to/caller.js:123:45)
 */
  const CALLER_LINE_INDEX = 3;
  const callStackLines = new Error().stack?.split('\n') ?? [];
  console.debug('callStackLines', { callStackLines });
  const callStackMatch = callStackLines.at(CALLER_LINE_INDEX)?.match(/^ {4}at .+? \((.+?):\d+:\d+\)$/);
  return callStackMatch?.[1] ?? null;
}

