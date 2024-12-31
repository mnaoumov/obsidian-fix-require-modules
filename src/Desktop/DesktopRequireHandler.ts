import type { FixRequireModulesPlugin } from "../FixRequireModulesPlugin.ts";
import type { RequireHandler } from "../RequireHandler.ts";

export class DesktopRequireHandler implements RequireHandler {
  constructor(private readonly originalRequire: NodeRequire) { }

  register(plugin: FixRequireModulesPlugin, customRequire: typeof window.require): void {
    const Module = this.originalRequire('node:module') as typeof import('node:module');
    const originalProtoRequire = Module.prototype.require;

    plugin.register(() => {
      Module.prototype.require = originalProtoRequire;
    });

    Module.prototype.require = customRequire;
  }
}
