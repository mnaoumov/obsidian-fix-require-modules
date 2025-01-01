import type { PackageJson } from 'obsidian-dev-utils/scripts/Npm';

import { FileSystemAdapter } from 'obsidian';
import { ObsidianPluginRepoPaths } from 'obsidian-dev-utils/obsidian/Plugin/ObsidianPluginRepoPaths';
import {
  basename,
  join
} from 'obsidian-dev-utils/Path';
import {
  getPackageJsonPath,
  readPackageJsonSync
} from 'obsidian-dev-utils/scripts/Npm';
import { getRootDir } from 'obsidian-dev-utils/scripts/Root';
import { trimStart } from 'obsidian-dev-utils/String';

import type { PluginRequireFn } from '../CustomRequire.ts';
import type { FixRequireModulesPlugin } from '../FixRequireModulesPlugin.ts';

import { transformToCommonJs } from '../babel/Babel.ts';
import {
  CacheInvalidationMode,

  CustomRequire,
  MODULE_NAME_SEPARATOR,
  ResolvedType

} from '../CustomRequire.ts';

type ModuleFn = (require: NodeRequire, module: { exports: unknown }, exports: unknown) => void;

class CustomRequireImpl extends CustomRequire {
  private electronModules = new Map<string, unknown>();
  private nodeBuiltinModules = new Set<string>();

  private originalProtoRequire!: NodeRequire;
  private get fs(): typeof import('node:fs') {
    const adapter = this.plugin.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) {
      throw new Error('Vault adapter is not a FileSystemAdapter');
    }

    return adapter.fs;
  }

  public override register(plugin: FixRequireModulesPlugin, pluginRequire: PluginRequireFn): void {
    super.register(plugin, pluginRequire);

    const Module = this.originalRequire('node:module') as typeof import('node:module');
    this.originalProtoRequire = Module.prototype.require;

    plugin.register(() => {
      Module.prototype.require = this.originalProtoRequire;
    });

    Module.prototype.require = this.requireWithCache;

    for (const [key, value] of Object.entries(this.originalRequire.cache)) {
      if ((key.startsWith('electron') || key.includes('app.asar')) && value?.exports) {
        this.electronModules.set(key, value.exports);
      }
    }

    this.nodeBuiltinModules = new Set(Module.builtinModules);
  }

  protected override canRequireSync(type: ResolvedType): boolean {
    return type !== ResolvedType.Url;
  }

  protected override requireSpecialModule(id: string): unknown {
    return super.requireSpecialModule(id) ?? this.electronModules.get(id) ?? this.requireNodeBuiltinModule(id);
  }

  protected override requireSync(id: string, type: ResolvedType, cacheInvalidationMode: CacheInvalidationMode): unknown {
    switch (type) {
      case ResolvedType.Module: {
        const [parentDir = '', moduleName = ''] = id.split(MODULE_NAME_SEPARATOR);
        return this.requireModuleSync(moduleName, parentDir, cacheInvalidationMode);
      }
      case ResolvedType.Path:
        return this.requirePathSync(id, cacheInvalidationMode);
      case ResolvedType.Url:
        throw new Error('Cannot require synchronously from URL');
    }
  }

  private checkTimestampChangedAndReloadIfNeeded(path: string, cacheInvalidationMode: CacheInvalidationMode): boolean {
    const timestamp = this.getTimestampSync(path);
    const cachedTimestamp = this.moduleTimestamps.get(path) ?? 0;
    if (timestamp !== cachedTimestamp) {
      this.loadModuleSync(path);
      this.moduleTimestamps.set(path, timestamp);
      return true;
    }

    let ans = false;

    const dependencies = this.moduleDependencies.get(path) ?? [];
    for (const dependency of dependencies) {
      const { resolvedId, resolvedType } = this.resolve(dependency, path);
      switch (resolvedType) {
        case ResolvedType.Module:
          for (const rootDir of this.getRootDirs(path)) {
            const packageJsonPath = getPackageJsonPath(rootDir);
            if (!this.existsSync(packageJsonPath)) {
              continue;
            }

            if (this.checkTimestampChangedAndReloadIfNeeded(packageJsonPath, cacheInvalidationMode)) {
              ans = true;
            }
          }
          break;
        case ResolvedType.Path:
          if (this.checkTimestampChangedAndReloadIfNeeded(resolvedId, cacheInvalidationMode)) {
            ans = true;
          }
          break;
        case ResolvedType.Url: {
          const errorMessage = this.getUrlDependencyErrorMessage(path, resolvedId, cacheInvalidationMode);
          switch (cacheInvalidationMode) {
            case CacheInvalidationMode.Always:
              throw new Error(errorMessage);
            case CacheInvalidationMode.WhenPossible:
              console.warn(errorMessage);
              break;
          }
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

  private existsSync(path: string): boolean {
    return this.fs.existsSync(path);
  }

  private findEntryPoint(packageJson: PackageJson): string {
    return this.findExportsEntryPoint(packageJson.exports) ?? packageJson.main ?? 'index.js';
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

  private getRootDirs(dir: string): string[] {
    const modulesRootDir = this.plugin.settingsCopy.modulesRoot ? join(this.vaultAbsolutePath, this.plugin.settingsCopy.modulesRoot) : null;
    return [getRootDir(dir), modulesRootDir].filter((dir): dir is string => dir !== null);
  }

  private getTimestampSync(path: string): number {
    return this.fs.statSync(path).mtimeMs;
  }

  private getUrlDependencyErrorMessage(path: string, resolvedId: string, cacheInvalidationMode: CacheInvalidationMode): string {
    return `Module ${path} depends on URL ${resolvedId}.
URL dependencies validation is not supported when cacheInvalidationMode=${cacheInvalidationMode}.
Consider using cacheInvalidationMode=${CacheInvalidationMode.Never} or ${this.getRequireAsyncAdvice()}`;
  }

  private loadModuleSync(path: string): void {
    if (basename(path) === ObsidianPluginRepoPaths.PackageJson as string) {
      return;
    }

    const content = this.readFileSync(path);
    const { code: contentCommonJs, error, hasTopLevelAwait } = transformToCommonJs(basename(path), content);
    if (error) {
      throw new Error(`Failed to transform module to CommonJS: ${path}`, { cause: error });
    }

    if (hasTopLevelAwait) {
      throw new Error(`Cannot load module: ${path}.
Top-level await is not supported in sync require.
Put them inside an async function or ${this.getRequireAsyncAdvice()}`);
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const moduleFn = new Function('require', 'module', 'exports', contentCommonJs ?? '') as ModuleFn;
      const exports = {};
      const module = { exports };
      const childRequire = this.makeChildRequire(path);
      moduleFn(childRequire, module, exports);
      this.addToModuleCache(path, exports);
    } catch (e) {
      throw new Error(`Failed to load module: ${path}`, { cause: e });
    }
  }

  private makeChildRequire(parentPath: string): NodeRequire {
    const childRequire = (id: string): unknown => this.childRequire(id, parentPath);
    return Object.assign(childRequire, this.requireWithCache);
  }

  private readFileSync(path: string): string {
    return this.fs.readFileSync(path, 'utf8');
  }

  private requireModuleSync(moduleName: string, parentDir: string, cacheInvalidationMode: CacheInvalidationMode): unknown {
    for (const rootDir of this.getRootDirs(parentDir)) {
      const packageDir = join(rootDir, 'node_modules', moduleName);
      if (!this.existsSync(packageDir)) {
        continue;
      }

      const packageJsonPath = getPackageJsonPath(packageDir);
      if (!this.existsSync(packageJsonPath)) {
        continue;
      }

      const packageJson = readPackageJsonSync(packageJsonPath);
      const entryPoint = this.findEntryPoint(packageJson);
      const entryPointPath = join(packageDir, entryPoint);
      return this.requirePathSync(entryPointPath, cacheInvalidationMode);
    }

    throw new Error(`Could not resolve module: ${moduleName}`);
  }

  private requireNodeBuiltinModule(id: string): unknown {
    const NODE_BUILTIN_MODULE_PREFIX = 'node:';
    id = trimStart(id, NODE_BUILTIN_MODULE_PREFIX);
    if (this.nodeBuiltinModules.has(id)) {
      return this.originalProtoRequire(id);
    }

    return null;
  }

  private requirePathSync(path: string, cacheInvalidationMode: CacheInvalidationMode): unknown {
    if (!this.existsSync(path)) {
      throw new Error(`File not found: ${path}`);
    }

    this.checkTimestampChangedAndReloadIfNeeded(path, cacheInvalidationMode);
    return this.modulesCache[path]?.exports;
  }
}

export const customRequire = new CustomRequireImpl();
