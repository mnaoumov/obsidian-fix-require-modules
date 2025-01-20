// eslint-disable-next-line import-x/no-nodejs-modules
import type {
  FSWatcher,
  WatchEventType
} from 'node:fs';

// eslint-disable-next-line import-x/no-nodejs-modules
import { watch } from 'node:fs';
import { invokeAsyncSafely } from 'obsidian-dev-utils/Async';
import { join } from 'obsidian-dev-utils/Path';

import { ScriptFolderWatcher } from '../ScriptFolderWatcher.ts';

class ScriptFolderWatcherImpl extends ScriptFolderWatcher {
  private watcher: FSWatcher | null = null;

  protected override async startWatcher(onChange: () => Promise<void>): Promise<boolean> {
    const invocableScriptsFolder = this.plugin.settingsCopy.getInvocableScriptsFolder();
    if (!invocableScriptsFolder) {
      return false;
    }

    if (!(await this.plugin.app.vault.exists(invocableScriptsFolder))) {
      const message = `Invocable scripts folder not found: ${invocableScriptsFolder}`;
      new Notice(message);
      console.error(message);
      return false;
    }

    const invocableScriptsFolderFullPath = join(this.plugin.app.vault.adapter.basePath, invocableScriptsFolder);
    this.watcher = watch(invocableScriptsFolderFullPath, { recursive: true }, (eventType: WatchEventType): void => {
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

export const scriptFolderWatcher: ScriptFolderWatcher = new ScriptFolderWatcherImpl();
