import type { FixRequireModulesPlugin } from '../FixRequireModulesPlugin.ts';

let originalRequire: NodeRequire;

export const requireHandler = {
  register(plugin: FixRequireModulesPlugin, originalRequire_: NodeRequire, customRequire: typeof window.require): void {
    originalRequire = originalRequire_;
    const Module = originalRequire('node:module') as typeof import('node:module');
    const originalProtoRequire = Module.prototype.require;

    plugin.register(() => {
      Module.prototype.require = originalProtoRequire;
    });

    Module.prototype.require = customRequire;
  },
  requireSpecialModule(id: string): unknown {
    return id;
  }
};
