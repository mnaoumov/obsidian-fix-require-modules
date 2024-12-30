import type { PluginSettingTab } from 'obsidian';

import { EmptySettings } from 'obsidian-dev-utils/obsidian/Plugin/EmptySettings';
import { PluginBase } from 'obsidian-dev-utils/obsidian/Plugin/PluginBase';

import { builtInModuleNames } from '../BuiltInModuleNames.ts';

export class FixRequireModulesPlugin extends PluginBase {
  private pluginRequire!: NodeRequire;

  protected override createPluginSettings(): EmptySettings {
    return new EmptySettings();
  }

  protected override createPluginSettingsTab(): null | PluginSettingTab {
    return null;
  }

  protected override onLayoutReady(): void {
    const oldRequire = window.require;
    this.register(() => {
      window.require = oldRequire;
    });

    this.pluginRequire = require;
    window.require = Object.assign(this.customRequire.bind(this), oldRequire);
  }

  private customRequire(id: string): unknown {
    id = id.split('?')[0] ?? '';
    if (builtInModuleNames.includes(id)) {
      return this.pluginRequire(id);
    }

    if (id === 'obsidian/app') {
      return this.app;
    }

    throw new Error(`Cannot resolve module: ${id}`);
  }
}
