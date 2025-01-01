import { PluginSettingTab } from 'obsidian';
import { PluginBase } from 'obsidian-dev-utils/obsidian/Plugin/PluginBase';

import {
  registerCodeButtonBlock,
  unloadTempPlugins
} from './CodeButtonBlock.ts';
import {
  clearCache,
  registerCustomRequire
} from './CustomRequire.ts';
import { FixRequireModulesPluginSettings } from './FixRequireModulesPluginSettings.ts';
import { FixRequireModulesPluginSettingsTab } from './FixRequireModulesPluginSettingsTab.ts';
import { getPlatformDependencies } from './PlatformDependencies.ts';
import {
  cleanupStartupScript,
  invokeStartupScript,
  registerInvocableScripts,
  selectAndInvokeScript
} from './Script.ts';
import type { ScriptDirectoryWatcher } from './ScriptDirectoryWatcher.ts';

export class FixRequireModulesPlugin extends PluginBase<FixRequireModulesPluginSettings> {
  private scriptDirectoryWatcher!: ScriptDirectoryWatcher;

  public override async saveSettings(newSettings: FixRequireModulesPluginSettings): Promise<void> {
    await super.saveSettings(newSettings);
    await this.scriptDirectoryWatcher.register(this, () => registerInvocableScripts(this));
  }

  protected override createPluginSettings(data: unknown): FixRequireModulesPluginSettings {
    return new FixRequireModulesPluginSettings(data);
  }

  protected override createPluginSettingsTab(): null | PluginSettingTab {
    return new FixRequireModulesPluginSettingsTab(this);
  }

  protected override async onLayoutReady(): Promise<void> {
    await registerCustomRequire(this, require);

    await this.saveSettings(this.settings);
    await invokeStartupScript(this);
    this.register(() => cleanupStartupScript(this));
  }

  protected override async onloadComplete(): Promise<void> {
    const platformDependencies = await getPlatformDependencies();
    this.scriptDirectoryWatcher = platformDependencies.scriptDirectoryWatcher;
    registerCodeButtonBlock(this);
    this.addCommand({
      callback: () => selectAndInvokeScript(this),
      id: 'invokeScript',
      name: 'Invoke Script: <<Choose>>'
    });

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
}
