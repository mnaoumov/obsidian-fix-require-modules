import type { FixRequireModulesPlugin } from './FixRequireModulesPlugin.ts';
import type { CustomRequireFn } from './types.js';

export interface RequireHandler {
  register(plugin: FixRequireModulesPlugin, originalRequire: NodeRequire, customRequire: CustomRequireFn): void;
  requireSpecialModule(id: string): unknown;
}
