// eslint-disable-next-line import-x/no-nodejs-modules
import type {
  FSWatcher,
  WatchEventType
} from 'node:fs';

// eslint-disable-next-line import-x/no-nodejs-modules
import { watch } from 'node:fs';
import { invokeAsyncSafely } from 'obsidian-dev-utils/Async';
import { join } from 'obsidian-dev-utils/Path';

import { ScriptDirectoryWatcher } from '../ScriptDirectoryWatcher.ts';

class ScriptDirectoryWatcherImpl extends ScriptDirectoryWatcher {
  private watcher: FSWatcher | null = null;

  protected startWatcher(onChange: () => Promise<void>): void {
    if (!this.plugin.settingsCopy.getInvocableScriptsDirectory()) {
      return;
    }

    const invocableScriptsDirectoryFullPath = join(this.plugin.app.vault.adapter.basePath, this.plugin.settingsCopy.getInvocableScriptsDirectory());
    this.watcher = watch(invocableScriptsDirectoryFullPath, { recursive: true }, (eventType: WatchEventType): void => {
      if (eventType === 'rename') {
        invokeAsyncSafely(() => onChange());
      }
    });
  }

  protected stopWatcher(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }
}

export const scriptDirectoryWatcher: ScriptDirectoryWatcher = new ScriptDirectoryWatcherImpl();
