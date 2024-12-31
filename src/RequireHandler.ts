import type { FixRequireModulesPlugin } from './FixRequireModulesPlugin.ts';

export interface RequireHandler {
  register(plugin: FixRequireModulesPlugin, originalRequire: NodeRequire, customRequire: typeof window.require): void;
  requireSpecialModule(id: string): unknown;
}
