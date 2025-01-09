import { debuggableEval } from 'debuggable-eval';
import { FileSystemAdapter } from 'obsidian';
import {
  basename,
  dirname,
  join
} from 'obsidian-dev-utils/Path';
import {
  getPackageJsonPath,
  readPackageJsonSync
} from 'obsidian-dev-utils/scripts/Npm';
import { getRootDir } from 'obsidian-dev-utils/scripts/Root';
import { trimStart } from 'obsidian-dev-utils/String';

import type { CodeScriptToolkitPlugin } from '../CodeScriptToolkitPlugin.ts';
import type {
  PluginRequireFn,
  RequireAsyncWrapperFn
} from '../RequireHandler.ts';

import { SequentialBabelPlugin } from '../babel/CombineBabelPlugins.ts';
import { ConvertToCommonJsBabelPlugin } from '../babel/ConvertToCommonJsBabelPlugin.ts';
import { FixSourceMapBabelPlugin } from '../babel/FixSourceMapBabelPlugin.ts';
import { WrapInRequireFunctionBabelPlugin } from '../babel/WrapInRequireFunctionBabelPlugin.ts';
import { CacheInvalidationMode } from '../CacheInvalidationMode.ts';
import {
  ENTRY_POINT,
  MODULE_NAME_SEPARATOR,
  NODE_MODULES_DIR,
  PATH_SUFFIXES,
  PRIVATE_MODULE_PREFIX,
  RELATIVE_MODULE_PATH_SEPARATOR,
  RequireHandler,
  ResolvedType,
  SCOPED_MODULE_PREFIX

} from '../RequireHandler.ts';
import { convertPathToObsidianUrl } from '../util/obsidian.ts';

type ModuleFn = (require: NodeRequire, module: { exports: unknown }, exports: unknown, requireAsyncWrapper: RequireAsyncWrapperFn) => void;

class RequireHandlerImpl extends RequireHandler {
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

  public override register(plugin: CodeScriptToolkitPlugin, pluginRequire: PluginRequireFn): void {
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

  protected override async existsDirectoryAsync(path: string): Promise<boolean> {
    return await Promise.resolve(this.existsDirectory(path));
  }

  protected override async existsFileAsync(path: string): Promise<boolean> {
    return await Promise.resolve(this.existsFile(path));
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
      this.moduleTimestamps.set(path, timestamp);
      this.initModuleAndAddToCache(path, () => this.requireString(content, path));
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
            if (!this.existsFile(packageJsonPath)) {
              continue;
            }

            if (this.checkTimestampChangedAndReloadIfNeeded(packageJsonPath, cacheInvalidationMode)) {
              ans = true;
            }
          }
          break;
        case ResolvedType.Path: {
          const existingFilePath = this.findExistingFilePath(resolvedId);
          if (existingFilePath == null) {
            throw new Error(`File not found: ${resolvedId}`);
          }

          if (this.checkTimestampChangedAndReloadIfNeeded(existingFilePath, cacheInvalidationMode)) {
            ans = true;
          }
          break;
        }
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

  private existsDirectory(path: string): boolean {
    return this.fileSystemAdapter.fs.existsSync(path) && this.fileSystemAdapter.fs.statSync(path).isDirectory();
  }

  private existsFile(path: string): boolean {
    return this.fileSystemAdapter.fs.existsSync(path) && this.fileSystemAdapter.fs.statSync(path).isFile();
  }

  private findExistingFilePath(path: string): null | string {
    for (const suffix of PATH_SUFFIXES) {
      const newPath = path + suffix;
      if (this.existsFile(newPath)) {
        return newPath;
      }
    }

    return null;
  }

  private getRootDirs(dir: string): string[] {
    const modulesRootDir = this.plugin.settingsCopy.modulesRoot ? join(this.vaultAbsolutePath, this.plugin.settingsCopy.modulesRoot) : null;

    const ans: string[] = [];
    for (const possibleDir of new Set([dir, modulesRootDir])) {
      if (possibleDir === null) {
        continue;
      }

      const rootDir = getRootDir(possibleDir);
      if (rootDir == null) {
        continue;
      }

      ans.push(rootDir);
    }

    return ans;
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
    let separatorIndex = moduleName.indexOf(RELATIVE_MODULE_PATH_SEPARATOR);

    if (moduleName.startsWith(SCOPED_MODULE_PREFIX)) {
      if (separatorIndex === -1) {
        throw new Error(`Invalid scoped module name: ${moduleName}`);
      }
      separatorIndex = moduleName.indexOf(RELATIVE_MODULE_PATH_SEPARATOR, separatorIndex + 1);
    }

    const baseModuleName = separatorIndex !== -1 ? moduleName.slice(0, separatorIndex) : moduleName;
    let relativeModuleName = ENTRY_POINT + (separatorIndex !== -1 ? moduleName.slice(separatorIndex) : '');

    for (const rootDir of this.getRootDirs(parentDir)) {
      let packageDir: string;
      if (moduleName.startsWith(PRIVATE_MODULE_PREFIX) || moduleName === ENTRY_POINT) {
        packageDir = rootDir;
        relativeModuleName = moduleName;
      } else {
        packageDir = join(rootDir, NODE_MODULES_DIR, baseModuleName);
      }

      if (!this.existsDirectory(packageDir)) {
        continue;
      }

      const packageJsonPath = getPackageJsonPath(packageDir);
      if (!this.existsFile(packageJsonPath)) {
        continue;
      }

      const packageJson = readPackageJsonSync(packageJsonPath);
      const relativeModulePath = this.getRelativeModulePath(packageJson, relativeModuleName);
      if (relativeModulePath == null) {
        continue;
      }

      const resolvedPath = join(packageDir, relativeModulePath);
      return this.requirePath(resolvedPath, cacheInvalidationMode);
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
    const existingFilePath = this.findExistingFilePath(path);
    if (existingFilePath == null) {
      throw new Error(`File not found: ${path}`);
    }

    this.checkTimestampChangedAndReloadIfNeeded(existingFilePath, cacheInvalidationMode);
    return this.modulesCache[existingFilePath]?.exports;
  }

  private requireString(content: string, path: string): unknown {
    if (path.endsWith('.json')) {
      return JSON.parse(content);
    }

    const filename = basename(path);

    const result = new SequentialBabelPlugin([
      new ConvertToCommonJsBabelPlugin(),
      new WrapInRequireFunctionBabelPlugin(false),
      new FixSourceMapBabelPlugin(convertPathToObsidianUrl(path))
    ]).transform(content, filename, dirname(path));

    if (result.error) {
      throw new Error(`Failed to transform module to CommonJS: ${path}`, { cause: result.error });
    }

    if (result.data.hasTopLevelAwait) {
      throw new Error(`Cannot load module: ${path}.
Top-level await is not supported in sync require.
Put them inside an async function or ${this.getRequireAsyncAdvice()}`);
    }

    try {
      const moduleFnWrapper = debuggableEval(result.transformedCode, `requireString/${path}`) as ModuleFn;
      const module = { exports: {} };
      const childRequire = this.makeChildRequire(path);

      return this.initModuleAndAddToCache(path, () => {
        // eslint-disable-next-line import-x/no-commonjs
        moduleFnWrapper(childRequire, module, module.exports, this.requireAsyncWrapper.bind(this));
        // eslint-disable-next-line import-x/no-commonjs
        return module.exports;
      });
    } catch (e) {
      throw new Error(`Failed to load module: ${path}`, { cause: e });
    }
  }
}

export const requireHandler = new RequireHandlerImpl();
