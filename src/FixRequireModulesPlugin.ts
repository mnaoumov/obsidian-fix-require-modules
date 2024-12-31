import { PluginSettingTab } from 'obsidian';
import { PluginBase } from 'obsidian-dev-utils/obsidian/Plugin/PluginBase';

import type { PlatformDependencies } from './PlatformDependencies.ts';

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
import { getPlatformDependencies } from './PlatformDependencies.ts';
import {
  cleanupStartupScript,
  invokeStartupScript,
  selectAndInvokeScript
} from './Script.ts';

export class FixRequireModulesPlugin extends PluginBase<FixRequireModulesPluginSettings> {
  private platformDependencies!: PlatformDependencies;

  public override async saveSettings(newSettings: FixRequireModulesPluginSettings): Promise<void> {
    await super.saveSettings(newSettings);
    this.platformDependencies.registerScriptDirectoryWatcher(this);
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

  protected override async onloadComplete(): Promise<void> {
    this.platformDependencies = await getPlatformDependencies();
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
