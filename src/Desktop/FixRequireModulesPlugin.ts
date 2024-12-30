// eslint-disable-next-line import-x/no-nodejs-modules
import type {
  FSWatcher,
  WatchEventType
} from 'node:fs';
import type { MaybePromise } from 'obsidian-dev-utils/Async';

// eslint-disable-next-line import-x/no-nodejs-modules
import { watch } from 'node:fs';
import { PluginSettingTab } from 'obsidian';
import { PluginBase } from 'obsidian-dev-utils/obsidian/Plugin/PluginBase';
import { join } from 'obsidian-dev-utils/Path';

import {
  registerCodeButtonBlock,
  unloadTempPlugins
} from './CodeButtonBlock.ts';
import {
  clearCache,
  registerCustomRequire
} from './CustomRequire.ts';
import { registerDynamicImport } from './DynamicImport.ts';
import { downloadEsbuild } from './esbuild.ts';
import { FixRequireModulesPluginSettings } from './FixRequireModulesPluginSettings.ts';
import { FixRequireModulesPluginSettingsTab } from './FixRequireModulesPluginSettingsTab.ts';
import {
  cleanupStartupScript,
  invokeStartupScript,
  registerInvocableScripts,
  selectAndInvokeScript
} from './Script.ts';
import { printError } from './util/Error.ts';

export class FixRequireModulesPlugin extends PluginBase<FixRequireModulesPluginSettings> {
  private _invocableScriptsDirectoryWatcher: FSWatcher | null = null;

  public override async saveSettings(newSettings: FixRequireModulesPluginSettings): Promise<void> {
    await super.saveSettings(newSettings);
    await registerInvocableScripts(this);
    this.configureInvocableScriptsDirectoryWatcher();
  }

  protected override createPluginSettings(data: unknown): FixRequireModulesPluginSettings {
    return new FixRequireModulesPluginSettings(data);
  }

  protected override createPluginSettingsTab(): null | PluginSettingTab {
    return new FixRequireModulesPluginSettingsTab(this);
  }

  protected override async onLayoutReady(): Promise<void> {
    await downloadEsbuild(this);
    registerCustomRequire(this, require);
    registerDynamicImport(this);

    await this.saveSettings(this.settings);
    await invokeStartupScript(this);
    this.register(() => cleanupStartupScript(this));
  }

  protected override onloadComplete(): MaybePromise<void> {
    registerCodeButtonBlock(this);
    this.addCommand({
      callback: () => selectAndInvokeScript(this),
      id: 'invokeScript',
      name: 'Invoke Script: <<Choose>>'
    });
    this.register(this.stopInvocableScriptsDirectoryWatcher.bind(this));

    this.addCommand({
      callback: clearCache,
      id: 'clearCache',
      name: 'Clear Cache'
    });

    this.addCommand({
      callback: unloadTempPlugins,
      id: 'unload-temp-plugins',
      name: 'Unload Temp Plugins'
    });
  }

  /**
   * @note We have to create our own watcher and not rely on Vault.on("create"|"delete"|"rename") events because they are not fired for dot-directories.
   * We want to be able to track changes to the invocable scripts directory, even if it is a dot-directory.
   */
  private configureInvocableScriptsDirectoryWatcher(): void {
    this.stopInvocableScriptsDirectoryWatcher();

    if (!this.settings.getInvocableScriptsDirectory()) {
      return;
    }

    const invocableScriptsDirectoryFullPath = join(this.app.vault.adapter.basePath, this.settings.getInvocableScriptsDirectory());

    this._invocableScriptsDirectoryWatcher = watch(invocableScriptsDirectoryFullPath, { recursive: true }, (eventType: WatchEventType): void => {
      if (eventType === 'rename') {
        registerInvocableScripts(this).catch(printError);
      }
    });
  }

  private stopInvocableScriptsDirectoryWatcher(): void {
    if (this._invocableScriptsDirectoryWatcher) {
      this._invocableScriptsDirectoryWatcher.close();
      this._invocableScriptsDirectoryWatcher = null;
    }
  }
}
