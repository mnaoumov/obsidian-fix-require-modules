
import type { FixRequireModulesPlugin } from './FixRequireModulesPlugin.ts';

export interface RequireHandler {
  register(plugin: FixRequireModulesPlugin, customRequire: typeof window.require): void;
}
