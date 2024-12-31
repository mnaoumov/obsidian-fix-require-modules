// eslint-disable-next-line import-x/no-nodejs-modules
import type {
  FSWatcher,
  WatchEventType
} from 'node:fs';

// eslint-disable-next-line import-x/no-nodejs-modules
import { watch } from 'node:fs';
import { invokeAsyncSafely } from 'obsidian-dev-utils/Async';
import { join } from 'obsidian-dev-utils/Path';

import type { FixRequireModulesPlugin } from '../FixRequireModulesPlugin.ts';

import { registerInvocableScripts } from '../Script.ts';

let invocableScriptsDirectoryWatcher: FSWatcher | null = null;
let wasRegisteredInPlugin = false;

export function registerScriptDirectoryWatcher(plugin: FixRequireModulesPlugin): void {
  if (!wasRegisteredInPlugin) {
    plugin.register(stopInvocableScriptsDirectoryWatcher);
    wasRegisteredInPlugin = true;
  }

  stopInvocableScriptsDirectoryWatcher();

  if (!plugin.settingsCopy.getInvocableScriptsDirectory()) {
    return;
  }

  const invocableScriptsDirectoryFullPath = join(plugin.app.vault.adapter.basePath, plugin.settingsCopy.getInvocableScriptsDirectory());
  invocableScriptsDirectoryWatcher = watch(invocableScriptsDirectoryFullPath, { recursive: true }, (eventType: WatchEventType): void => {
    if (eventType === 'rename') {
      invokeAsyncSafely(() => registerInvocableScripts(plugin));
    }
  });
}

function stopInvocableScriptsDirectoryWatcher(): void {
  if (invocableScriptsDirectoryWatcher) {
    invocableScriptsDirectoryWatcher.close();
    invocableScriptsDirectoryWatcher = null;
  }
}
