import {
  Plugin,
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

    new Setting(this.containerEl)
      .setName("Config path")
      .setDesc("Path to the config file")
      .addText((text) =>
        text
          .setPlaceholder("path/to/config.ts")
          .setValue(this.plugin!.settings.configPath)
          .onChange(async (value) => {
            this.plugin.updateSettings({ configPath: value });
          })
      );
  }
}
