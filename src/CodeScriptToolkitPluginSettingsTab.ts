import {
  Notice,
  Setting
} from 'obsidian';
import { appendCodeBlock } from 'obsidian-dev-utils/DocumentFragment';
import { PluginSettingsTabBase } from 'obsidian-dev-utils/obsidian/Plugin/PluginSettingsTabBase';
import { extend } from 'obsidian-dev-utils/obsidian/Plugin/ValueComponent';

import type { CodeScriptToolkitPlugin } from './CodeScriptToolkitPlugin.ts';
import type { CodeScriptToolkitPluginPluginSettings } from './CodeScriptToolkitPluginSettings.ts';

export class CodeScriptToolkitPluginPluginSettingsTab extends PluginSettingsTabBase<CodeScriptToolkitPlugin, CodeScriptToolkitPluginPluginSettings> {
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
      .addText((text) => extend(text).bind(this.plugin, 'modulesRoot', { pluginSettings, shouldAutoSave: false })
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
      .addText((text) => extend(text).bind(this.plugin, 'invocableScriptsDirectory', { pluginSettings, shouldAutoSave: false })
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
      .addText((text) => extend(text).bind(this.plugin, 'startupScriptPath', { pluginSettings, shouldAutoSave: false })
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

    new Setting(this.containerEl)
      .setName('Mobile changes checking interval')
      .setDesc('Interval in seconds to check for changes in the invocable scripts directory (only on mobile)')
      .addText((text) => {
        extend(text).bind(this.plugin, 'mobileChangesCheckingIntervalInSeconds', {
          componentToPluginSettingsValueConverter: (value: string) => parseInt(value, 10),
          pluginSettingsToComponentValueConverter: (value: number) => value.toString(),
          valueValidator(value: string) {
            const number = parseInt(value, 10);
            if (isNaN(number) || number < 1) {
              return 'Interval must be greater than 0';
            }
            return null;
          }
        })
          .setPlaceholder('30');

        text.inputEl.type = 'number';
        text.inputEl.min = '1';
      });
  }
}
