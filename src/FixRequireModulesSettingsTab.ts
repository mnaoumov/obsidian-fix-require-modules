import {
  Notice,
  PluginSettingTab,
  Setting,
} from "obsidian";
import type FixRequireModulesPlugin from "./FixRequireModulesPlugin.ts";

export default class FixRequireModulesSettingsTab extends PluginSettingTab {
  public override plugin: FixRequireModulesPlugin;

  public constructor(plugin: FixRequireModulesPlugin) {
    super(plugin.app, plugin);
    this.plugin = plugin;
  }

  public override display(): void {
    this.containerEl.empty();
    this.containerEl.createEl("h2", { text: "Fix Require Modules" });

    const settings = this.plugin.settings;

    new Setting(this.containerEl)
      .setName("Script modules root")
      .setDesc(createDocumentFragment(`Path to the directory that is considered as <b><code>/</code></b> in <b><code>require("/script.js")</code></b><br />
Leave blank to use the root of the vault.
`))
      .addText(text =>
        text
          .setPlaceholder("path/to/script/modules/root")
          .setValue(this.plugin.settings.modulesRoot)
          .onChange((value) => settings.modulesRoot = value)
      );

    new Setting(this.containerEl)
      .setName("Invocable scripts directory")
      .setDesc(createDocumentFragment(`Path to the directory with invocable scripts.<br />
Should be a relative path to the <b><code>Script modules root</code></b><br />
Leave blank if you don't use invocable scripts.
`))
      .addText(text =>
        text
          .setPlaceholder("path/to/invocable/scripts/directory")
          .setValue(this.plugin.settings.invocableScriptsDirectory)
          .onChange((value) => settings.invocableScriptsDirectory = value)
      );

    new Setting(this.containerEl)
      .setName("Startup script path")
      .setDesc(createDocumentFragment(`Path to the invocable script executed on startup.<br />
Should be a relative path to the <b><code>Script modules root</code></b><br />
Leave blank if you don't use startup script.
`))
      .addText(text =>
        text
          .setPlaceholder("path/to/startup.ts")
          .setValue(this.plugin.settings.startupScriptPath)
          .onChange((value) => settings.startupScriptPath = value)
      );

    new Setting(this.containerEl)
      .addButton(button =>
        button
          .setButtonText("Save settings")
          .onClick(async () => {
            await this.plugin.saveSettings(settings);
            new Notice("Settings saved");
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

function createDocumentFragment(htmlString: string): DocumentFragment {
  const template = createEl("template");
  template.innerHTML = htmlString;
  return template.content;
}
