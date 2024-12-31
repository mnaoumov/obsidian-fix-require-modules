import type { FixRequireModulesPlugin } from '../FixRequireModulesPlugin.ts';

export function registerScriptDirectoryWatcher(plugin: FixRequireModulesPlugin, onChange: () => Promise<void>): void {
  plugin.register(() => {
    console.log(onChange);
  });
}
