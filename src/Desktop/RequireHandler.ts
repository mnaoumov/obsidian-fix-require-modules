import type { FixRequireModulesPlugin } from '../FixRequireModulesPlugin.ts';
import type { RequireExFn } from '../types.js';

let originalRequire: NodeRequire;
const electronModules = new Map<string, unknown>();

export const requireHandler = {
  register(plugin: FixRequireModulesPlugin, originalRequire_: NodeRequire, customRequire: RequireExFn): void {
    originalRequire = originalRequire_;
    const Module = originalRequire('node:module') as typeof import('node:module');
    const originalProtoRequire = Module.prototype.require;

    plugin.register(() => {
      Module.prototype.require = originalProtoRequire;
    });

    Module.prototype.require = customRequire;

    for (const [key, value] of Object.entries(originalRequire.cache)) {
      if ((key.startsWith('electron') || key.includes('app.asar')) && value?.exports) {
        electronModules.set(key, value.exports);
      }
    }
  },
  requireSpecialModule(id: string): unknown {
    return electronModules.get(id);
  }
};
