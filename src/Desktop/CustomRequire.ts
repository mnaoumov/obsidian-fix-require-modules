import { FileSystemAdapter } from 'obsidian';
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
import { CacheInvalidationMode } from '../CacheInvalidationMode.ts';
import {
  CustomRequire,
  MODULE_NAME_SEPARATOR,
  ResolvedType

} from '../CustomRequire.ts';

type ModuleFn = (require: NodeRequire, module: { exports: unknown }, exports: unknown) => void;

class CustomRequireImpl extends CustomRequire {
  private electronModules = new Map<string, unknown>();
  private nodeBuiltinModules = new Set<string>();
  private originalProtoRequire!: NodeRequire;
  private get fileSystemAdapter(): FileSystemAdapter {
    const adapter = this.plugin.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) {
      throw new Error('Vault adapter is not a FileSystemAdapter');
    }

    return adapter;
  }

  public override register(plugin: FixRequireModulesPlugin, pluginRequire: PluginRequireFn): void {
    super.register(plugin, pluginRequire);

    const Module = this.originalRequire('node:module') as typeof import('node:module');
    this.originalProtoRequire = Module.prototype.require;

    plugin.register(() => {
      Module.prototype.require = this.originalProtoRequire;
    });

    Module.prototype.require = this.requireEx;

    for (const [key, value] of Object.entries(this.originalRequire.cache)) {
      if ((key.startsWith('electron') || key.includes('app.asar')) && value?.exports) {
        this.electronModules.set(key, value.exports);
      }
    }

    this.nodeBuiltinModules = new Set(Module.builtinModules);
  }

  protected override canRequireNonCached(type: ResolvedType): boolean {
    return type !== ResolvedType.Url;
  }

  protected override async existsAsync(path: string): Promise<boolean> {
    return await Promise.resolve(this.exists(path));
  }

  protected override async getTimestampAsync(path: string): Promise<number> {
    return (await this.fileSystemAdapter.fsPromises.stat(path)).mtimeMs;
  }

  protected override async readFileAsync(path: string): Promise<string> {
    return this.fileSystemAdapter.fsPromises.readFile(path, 'utf8');
  }

  protected override requireNonCached(id: string, type: ResolvedType, cacheInvalidationMode: CacheInvalidationMode): unknown {
    switch (type) {
      case ResolvedType.Module: {
        const [parentDir = '', moduleName = ''] = id.split(MODULE_NAME_SEPARATOR);
        return this.requireModule(moduleName, parentDir, cacheInvalidationMode);
      }
      case ResolvedType.Path:
        return this.requirePath(id, cacheInvalidationMode);
      case ResolvedType.Url:
        throw new Error('Cannot require synchronously from URL');
    }
  }

  protected override requireSpecialModule(id: string): unknown {
    return super.requireSpecialModule(id) ?? this.electronModules.get(id) ?? this.requireNodeBuiltinModule(id);
  }

  private checkTimestampChangedAndReloadIfNeeded(path: string, cacheInvalidationMode: CacheInvalidationMode): boolean {
    const timestamp = this.getTimestamp(path);
    const cachedTimestamp = this.moduleTimestamps.get(path) ?? 0;
    if (timestamp !== cachedTimestamp) {
      const content = this.readFile(path);
      const module = this.requireString(content, path);
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
          for (const rootDir of this.getRootDirs(path)) {
            const packageJsonPath = getPackageJsonPath(rootDir);
            if (!this.exists(packageJsonPath)) {
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

  private exists(path: string): boolean {
    return this.fileSystemAdapter.fs.existsSync(path);
  }

  private getRootDirs(dir: string): string[] {
    const modulesRootDir = this.plugin.settingsCopy.modulesRoot ? join(this.vaultAbsolutePath, this.plugin.settingsCopy.modulesRoot) : null;
    return [getRootDir(dir), modulesRootDir].filter((dir): dir is string => dir !== null);
  }

  private getTimestamp(path: string): number {
    return this.fileSystemAdapter.fs.statSync(path).mtimeMs;
  }

  private getUrlDependencyErrorMessage(path: string, resolvedId: string, cacheInvalidationMode: CacheInvalidationMode): string {
    return `Module ${path} depends on URL ${resolvedId}.
URL dependencies validation is not supported when cacheInvalidationMode=${cacheInvalidationMode}.
Consider using cacheInvalidationMode=${CacheInvalidationMode.Never} or ${this.getRequireAsyncAdvice()}`;
  }

  private readFile(path: string): string {
    return this.fileSystemAdapter.fs.readFileSync(path, 'utf8');
  }

  private requireModule(moduleName: string, parentDir: string, cacheInvalidationMode: CacheInvalidationMode): unknown {
    for (const rootDir of this.getRootDirs(parentDir)) {
      const packageDir = join(rootDir, 'node_modules', moduleName);
      if (!this.exists(packageDir)) {
        continue;
      }

      const packageJsonPath = getPackageJsonPath(packageDir);
      if (!this.exists(packageJsonPath)) {
        continue;
      }

      const packageJson = readPackageJsonSync(packageJsonPath);
      const entryPoint = this.findEntryPoint(packageJson);
      const entryPointPath = join(packageDir, entryPoint);
      return this.requirePath(entryPointPath, cacheInvalidationMode);
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

  private requirePath(path: string, cacheInvalidationMode: CacheInvalidationMode): unknown {
    if (!this.exists(path)) {
      throw new Error(`File not found: ${path}`);
    }

    this.checkTimestampChangedAndReloadIfNeeded(path, cacheInvalidationMode);
    return this.modulesCache[path]?.exports;
  }

  private requireString(content: string, path: string): unknown {
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
      return exports;
    } catch (e) {
      throw new Error(`Failed to load module: ${path}`, { cause: e });
    }
  }
}

export const customRequire = new CustomRequireImpl();
