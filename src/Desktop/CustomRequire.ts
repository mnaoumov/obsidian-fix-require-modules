import type { PackageJson } from 'obsidian-dev-utils/scripts/Npm';

import { FileSystemAdapter } from 'obsidian';
import { join } from 'obsidian-dev-utils/Path';
import { readPackageJsonSync } from 'obsidian-dev-utils/scripts/Npm';
import { getRootDir } from 'obsidian-dev-utils/scripts/Root';
import { trimStart } from 'obsidian-dev-utils/String';

import type {
  PluginRequireFn,
  ResolvedType
} from '../CustomRequire.ts';
import type { FixRequireModulesPlugin } from '../FixRequireModulesPlugin.ts';

import {
  CustomRequire,
  MODULE_NAME_SEPARATOR
} from '../CustomRequire.ts';

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
    return type !== 'url';
  }

  protected override requireSpecialModule(id: string): unknown {
    return super.requireSpecialModule(id) ?? this.electronModules.get(id) ?? this.requireNodeBuiltinModule(id);
  }

  protected override requireSync(id: string, type: ResolvedType): unknown {
    switch (type) {
      case 'module': {
        const [parentDir = '', moduleName = ''] = id.split(MODULE_NAME_SEPARATOR);
        return this.requireModuleSync(moduleName, parentDir);
      }
      case 'path':
        return this.requirePathSync(id);
      case 'url':
        throw new Error('Cannot require synchronously from URL');
    }
  }

  private existsSync(path: string): boolean {
    return this.fs.existsSync(path);
  }

  private findEntryPoint(packageJson: PackageJson): string {
    return this.findExportsEntryPoint(packageJson.exports) ?? packageJson.main ?? 'index.js';
  }

  private findExportsEntryPoint(_exports: PackageJson['exports'], isTopLevel = true): null | string {
    if (!_exports) {
      return null;
    }

    if (typeof _exports === 'string') {
      return _exports;
    }

    let exportConditions;

    if (Array.isArray(_exports)) {
      if (!_exports[0]) {
        return null;
      }

      if (typeof _exports[0] === 'string') {
        return _exports[0];
      }

      exportConditions = _exports[0];
    } else {
      exportConditions = _exports;
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

  private getModificationTimeSync(path: string): number {
    return this.fs.statSync(path).mtimeMs;
  }

  private readFileSync(path: string): string {
    return this.fs.readFileSync(path, 'utf8');
  }

  private requireModuleSync(moduleName: string, parentDir: string): unknown {
    const parentDirRoot = getRootDir(parentDir);
    const modulesRootDir = this.plugin.settingsCopy.modulesRoot ? join(this.vaultAbsolutePath, this.plugin.settingsCopy.modulesRoot) : null;

    for (const rootDir of [parentDirRoot, modulesRootDir]) {
      if (!rootDir) {
        continue;
      }

      const packageDir = join(rootDir, 'node_modules', moduleName);
      const packageJsonPath = join(packageDir, 'package.json');
      if (this.existsSync(packageJsonPath)) {
        const packageJson = readPackageJsonSync(packageJsonPath);
        const entryPoint = this.findEntryPoint(packageJson);
        const entryPointPath = join(packageDir, entryPoint);
        return this.requirePathSync(entryPointPath);
      }
    }

    throw new Error(`Could not resolve ${moduleName}`);
  }

  private requireNodeBuiltinModule(id: string): unknown {
    const NODE_BUILTIN_MODULE_PREFIX = 'node:';
    id = trimStart(id, NODE_BUILTIN_MODULE_PREFIX);
    if (this.nodeBuiltinModules.has(id)) {
      return this.originalProtoRequire(id);
    }

    return null;
  }

  private requirePathSync(path: string): unknown {
    if (!this.existsSync(path)) {
      throw new Error(`File not found: ${path}`);
    }

    // const modificationTime = this.getModificationTimeSync(path);
    // const content = this.readFileSync(path);
    return '';
  }
}

export const customRequire = new CustomRequireImpl();
