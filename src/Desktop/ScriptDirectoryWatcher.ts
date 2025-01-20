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

  protected override async startWatcher(onChange: () => Promise<void>): Promise<boolean> {
    const invocableScriptsDirectory = this.plugin.settingsCopy.getInvocableScriptsDirectory();
    if (!invocableScriptsDirectory) {
      return false;
    }

    if (!(await this.plugin.app.vault.exists(invocableScriptsDirectory))) {
      const message = `Invocable scripts folder not found: ${invocableScriptsDirectory}`;
      new Notice(message);
      console.error(message);
      return false;
    }

    const invocableScriptsDirectoryFullPath = join(this.plugin.app.vault.adapter.basePath, invocableScriptsDirectory);
    this.watcher = watch(invocableScriptsDirectoryFullPath, { recursive: true }, (eventType: WatchEventType): void => {
      if (eventType === 'rename') {
        invokeAsyncSafely(() => onChange());
      }
    });

    return true;
  }

  protected override stopWatcher(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }
}

export const scriptDirectoryWatcher: ScriptDirectoryWatcher = new ScriptDirectoryWatcherImpl();
