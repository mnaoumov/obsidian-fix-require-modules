import {
  PluginSettingTab,
  Setting
} from "obsidian";
import type FixRequireModulesPlugin from "./FixRequireModulesPlugin.ts";

export default class FixRequireModulesSettingsTab extends PluginSettingTab {
  public override plugin: FixRequireModulesPlugin;

  constructor(plugin: FixRequireModulesPlugin) {
    super(plugin.app, plugin);
    this.plugin = plugin;
  }

  override display() {
    this.containerEl.empty();
    this.containerEl.createEl("h2", { text: "Fix Require Modules" });

    let configPath = this.plugin.settings.configPath;
    new Setting(this.containerEl)
      .setName("Config path")
      .setDesc("Path to the config file")
      .addText(text =>
        text
          .setPlaceholder("path/to/config.ts")
          .setValue(configPath)
          .onChange(value => configPath = value)
      )
      .addButton(button =>
        button
          .setButtonText("Save")
          .setTooltip("Save config path and reload config")
          .onClick(async () => {
            this.plugin.updateSettings({ configPath });
          })
      );

    new Setting(this.containerEl)
      .setName("Hotkeys")
      .setDesc("Hotkeys to invoke scripts")
      .addButton(button =>
        button
          .setButtonText("Configure")
          .setTooltip("Configure Hotkeys")
          .onClick(() => {
            const hotkeysTab = this.app.setting.openTabById("hotkeys");
            hotkeysTab.searchComponent.setValue(`${this.plugin.manifest.name}:`);
            hotkeysTab.updateHotkeyVisibility();
          })
      );
  }
}
