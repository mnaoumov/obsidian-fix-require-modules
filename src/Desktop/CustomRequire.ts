import { trimStart } from 'obsidian-dev-utils/String';

import type { PluginRequireFn } from '../CustomRequire.ts';
import type { FixRequireModulesPlugin } from '../FixRequireModulesPlugin.ts';

import { CustomRequire } from '../CustomRequire.ts';

class CustomRequireImpl extends CustomRequire {
  private electronModules = new Map<string, unknown>();
  private nodeBuiltinModules = new Set<string>();
  private originalProtoRequire!: NodeRequire;

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

  protected override canReadFileSync(): boolean {
    return true;
  }

  protected override requireSpecialModule(id: string): unknown {
    return super.requireSpecialModule(id) ?? this.electronModules.get(id) ?? this.requireNodeBuiltinModule(id);
  }

  private requireNodeBuiltinModule(id: string): unknown {
    const NODE_BUILTIN_MODULE_PREFIX = 'node:';
    id = trimStart(id, NODE_BUILTIN_MODULE_PREFIX);
    if (this.nodeBuiltinModules.has(id)) {
      return this.originalProtoRequire(id);
    }

    return null;
  }
}

export const customRequire = new CustomRequireImpl();
