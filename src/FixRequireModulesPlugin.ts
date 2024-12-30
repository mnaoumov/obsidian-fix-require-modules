import type {
  PluginManifest,
  PluginSettingTab
} from 'obsidian';

import {
  App,
  Platform,
  Plugin
} from 'obsidian';
import { EmptySettings } from 'obsidian-dev-utils/obsidian/Plugin/EmptySettings';
import { PluginBase } from 'obsidian-dev-utils/obsidian/Plugin/PluginBase';

import { builtInModuleNames } from './BuiltInModuleNames.ts';

interface ChildPluginModule {
  FixRequireModulesPlugin: new (app: App, manifest: PluginManifest) => Plugin;
}

export class FixRequireModulesPlugin extends PluginBase {
  public readonly builtInModuleNames = Object.freeze(builtInModuleNames);

  protected override createPluginSettings(): EmptySettings {
    return new EmptySettings();
  }

  protected override createPluginSettingsTab(): null | PluginSettingTab {
    return null;
  }

  protected override async onloadComplete(): Promise<void> {
    let childPluginModule: ChildPluginModule;
    if (Platform.isMobile) {
      childPluginModule = await import('./Mobile/FixRequireModulesPlugin.ts') as ChildPluginModule;
    } else {
      childPluginModule = await import('./Desktop/FixRequireModulesPlugin.ts') as ChildPluginModule;
    }

    const childPlugin = new childPluginModule.FixRequireModulesPlugin(this.app, this.manifest);
    this.addChild(childPlugin);
  }
}
