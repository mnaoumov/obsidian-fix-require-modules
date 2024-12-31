import type { App } from 'obsidian';

import { invokeAsyncSafely } from 'obsidian-dev-utils/Async';

import type { FixRequireModulesPlugin } from '../FixRequireModulesPlugin.ts';

const modificationTimes = new Map<string, number>();
let wasRegisteredInPlugin = false;
let timeoutId: null | number = null;

interface ModificationEntry {
  isChanged: boolean;
  modificationTime: number;
}

export async function registerScriptDirectoryWatcher(plugin: FixRequireModulesPlugin, onChange: () => Promise<void>): Promise<void> {
  if (!wasRegisteredInPlugin) {
    plugin.register(() => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    });
    wasRegisteredInPlugin = true;
  }

  modificationTimes.clear();
  await checkChanges(plugin, onChange);
}

async function checkChanges(plugin: FixRequireModulesPlugin, onChange: () => Promise<void>): Promise<void> {
  if (timeoutId !== null) {
    window.clearTimeout(timeoutId);
  }
  timeoutId = null;

  if (plugin.settingsCopy.modulesRoot) {
    const modificationEntry = await checkFile(plugin.app, plugin.settingsCopy.modulesRoot, true);
    if (modificationEntry.isChanged) {
      await onChange();
    }
  }

  timeoutId = window.setTimeout(
    () => { invokeAsyncSafely(() => checkChanges(plugin, onChange)); },
    plugin.settingsCopy.mobileChangesCheckingIntervalInSeconds * 1000
  );
}

async function checkFile(app: App, file: string, isFolder: boolean): Promise<ModificationEntry> {
  const stat = await app.vault.adapter.stat(file);
  let modificationTime = stat?.mtime ?? 0;
  let isUpdated = modificationTimes.get(file) !== modificationTime;

  if (isFolder) {
    const listedFiles = await app.vault.adapter.list(file);

    for (const subFile of listedFiles.files) {
      await checkSubFile(subFile, false);
    }

    for (const subFolder of listedFiles.folders) {
      await checkSubFile(subFolder, true);
    }
  }

  modificationTimes.set(file, modificationTime);
  return { isChanged: isUpdated, modificationTime };

  async function checkSubFile(subFile: string, isFolder: boolean): Promise<void> {
    const subFileModificationEntry = await checkFile(app, subFile, isFolder);
    if (subFileModificationEntry.isChanged) {
      isUpdated = true;
    }
    if (subFileModificationEntry.modificationTime > modificationTime) {
      modificationTime = subFileModificationEntry.modificationTime;
    }
  }
}
