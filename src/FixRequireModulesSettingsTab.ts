import {
  PluginSettingTab,
  Setting,
  debounce
} from "obsidian";
import type FixRequireModulesPlugin from "./FixRequireModulesPlugin.ts";
import type FixRequireModulesSettings from "./FixRequireModulesSettings.ts";

export default class FixRequireModulesSettingsTab extends PluginSettingTab {
  public override plugin: FixRequireModulesPlugin;

  public constructor(plugin: FixRequireModulesPlugin) {
    super(plugin.app, plugin);
    this.plugin = plugin;
  }

  public override display(): void {
    this.containerEl.empty();
    this.containerEl.createEl("h2", { text: "Fix Require Modules" });

    const extensionsStr = "(.js, .cjs, .mjs, .ts, .cts, .mts)";

    new Setting(this.containerEl)
      .setName("Scripts directory")
      .setDesc(`Path to directory with script files ${extensionsStr}`)
      .addText(text =>
        text
          .setPlaceholder("path/to/scripts/directory")
          .setValue(this.plugin.settings.scriptsDirectory)
          .onChange(this.createOnChangeHandler("scriptsDirectory"))
      );

    new Setting(this.containerEl)
      .setName("Startup script path")
      .setDesc(`Path to the the startup script ${extensionsStr}`)
      .addText(text =>
        text
          .setPlaceholder("path/to/startup.ts")
          .setValue(this.plugin.settings.startupScriptPath)
          .onChange(this.createOnChangeHandler("startupScriptPath"))
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

  private createOnChangeHandler<PropertyKey extends keyof FixRequireModulesSettings>(
    propertyKey: PropertyKey
  ): (value: FixRequireModulesSettings[PropertyKey]) => void {
    const DEBOUNCE_TIMEOUT_IN_MILLISECONDS = 2000;

    return debounce(async (value: FixRequireModulesSettings[PropertyKey]) => {
      await this.plugin.updateSettings({ [propertyKey]: value });
    }, DEBOUNCE_TIMEOUT_IN_MILLISECONDS);
  }
}
