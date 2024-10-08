import {
  Notice,
  Setting
} from 'obsidian';
import { appendCodeBlock } from 'obsidian-dev-utils/DocumentFragment';
import { PluginSettingsTabBase } from 'obsidian-dev-utils/obsidian/Plugin/PluginSettingsTabBase';
import { bindUiComponent } from 'obsidian-dev-utils/obsidian/Plugin/UIComponent';

import type FixRequireModulesPlugin from './FixRequireModulesPlugin.ts';
import type FixRequireModulesPluginSettings from './FixRequireModulesPluginSettings.ts';

export default class FixRequireModulesPluginSettingsTab extends PluginSettingsTabBase<FixRequireModulesPlugin, FixRequireModulesPluginSettings> {
  public override display(): void {
    this.containerEl.empty();

    const pluginSettings = this.plugin.settingsCopy;

    new Setting(this.containerEl)
      .setName('Script modules root')
      .setDesc(createFragment((f) => {
        f.appendText('Path to the directory that is considered as ');
        appendCodeBlock(f, '/');
        f.appendText(' in ');
        appendCodeBlock(f, 'require("/script.js")');
        f.createEl('br');
        f.appendText('Leave blank to use the root of the vault.');
      }))
      .addText((text) => bindUiComponent(this.plugin, text, 'modulesRoot', { autoSave: false, pluginSettings })
        .setPlaceholder('path/to/script/modules/root')
      );

    new Setting(this.containerEl)
      .setName('Invocable scripts directory')
      .setDesc(createFragment((f) => {
        f.appendText('Path to the directory with invocable scripts.');
        f.createEl('br');
        f.appendText('Should be a relative path to the ');
        appendCodeBlock(f, 'Script modules root');
        f.createEl('br');
        f.appendText('Leave blank if you don\'t use invocable scripts.');
      }))
      .addText((text) => bindUiComponent(this.plugin, text, 'invocableScriptsDirectory', { autoSave: false, pluginSettings })
        .setPlaceholder('path/to/invocable/scripts/directory')
      );

    new Setting(this.containerEl)
      .setName('Startup script path')
      .setDesc(createFragment((f) => {
        f.appendText('Path to the invocable script executed on startup.');
        f.createEl('br');
        f.appendText('Should be a relative path to the ');
        appendCodeBlock(f, 'Script modules root');
        f.createEl('br');
        f.appendText('Leave blank if you don\'t use startup script.');
      }))
      .addText((text) => bindUiComponent(this.plugin, text, 'startupScriptPath', { autoSave: false, pluginSettings })
        .setPlaceholder('path/to/startup.ts')
      );

    new Setting(this.containerEl)
      .addButton((button) =>
        button
          .setButtonText('Save settings')
          .onClick(async () => {
            await this.plugin.saveSettings(pluginSettings);
            new Notice('Settings saved');
          })
      );

    new Setting(this.containerEl)
      .setName('Hotkeys')
      .setDesc('Hotkeys to invoke scripts')
      .addButton((button) =>
        button
          .setButtonText('Configure')
          .setTooltip('Configure Hotkeys')
          .onClick(() => {
            const hotkeysTab = this.app.setting.openTabById('hotkeys');
            hotkeysTab.searchComponent.setValue(`${this.plugin.manifest.name}:`);
            hotkeysTab.updateHotkeyVisibility();
          })
      );
  }
}
