import type { App } from 'obsidian';

import { invokeAsyncSafely } from 'obsidian-dev-utils/Async';

import { ScriptDirectoryWatcher } from '../ScriptDirectoryWatcher.ts';

interface ModificationEntry {
  isChanged: boolean;
  modificationTime: number;
}

const MILLISECONDS_IN_SECOND = 1000;

class ScriptDirectoryWatcherImpl extends ScriptDirectoryWatcher {
  private modificationTimes = new Map<string, number>();
  private timeoutId: null | number = null;

  protected override async startWatcher(onChange: () => Promise<void>): Promise<void> {
    if (this.plugin.settingsCopy.modulesRoot) {
      const modificationEntry = await this.checkFile(this.plugin.app, this.plugin.settingsCopy.modulesRoot, true);
      if (modificationEntry.isChanged) {
        await onChange();
      }
    }

    this.timeoutId = window.setTimeout(
      () => { invokeAsyncSafely(() => this.startWatcher(onChange)); },
      this.plugin.settingsCopy.mobileChangesCheckingIntervalInSeconds * MILLISECONDS_IN_SECOND
    );
  }

  protected override stopWatcher(): void {
    this.modificationTimes.clear();
    if (this.timeoutId === null) {
      return;
    }
    window.clearTimeout(this.timeoutId);
    this.timeoutId = null;
  }

  private async checkFile(app: App, file: string, isFolder: boolean): Promise<ModificationEntry> {
    const stat = await app.vault.adapter.stat(file);
    let modificationTime = stat?.mtime ?? 0;
    let isUpdated = this.modificationTimes.get(file) !== modificationTime;

    const checkSubFile = async (subFile: string, isFolder: boolean): Promise<void> => {
      const subFileModificationEntry = await this.checkFile(app, subFile, isFolder);
      if (subFileModificationEntry.isChanged) {
        isUpdated = true;
      }
      if (subFileModificationEntry.modificationTime > modificationTime) {
        modificationTime = subFileModificationEntry.modificationTime;
      }
    };

    if (isFolder) {
      const listedFiles = await app.vault.adapter.list(file);

      for (const subFile of listedFiles.files) {
        await checkSubFile(subFile, false);
      }

      for (const subFolder of listedFiles.folders) {
        await checkSubFile(subFolder, true);
      }
    }

    this.modificationTimes.set(file, modificationTime);
    return { isChanged: isUpdated, modificationTime };
  }
}

export const scriptDirectoryWatcher = new ScriptDirectoryWatcherImpl();
