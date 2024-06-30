import {
  Plugin,
} from "obsidian";
import {
  builtInModuleNames,
  registerCustomRequire
} from "./CustomRequire.ts";
import FixRequireModulesSettingsTab from "./FixRequireModulesSettingsTab.ts";
import FixRequireModulesSettings from "./FixRequireModulesSettings.ts";
import {
  invoke,
  registerInvocableScripts,
  selectAndInvokeScript,
  stopWatcher
} from "./Script.ts";
import { registerDynamicImport } from "./DynamicImport.ts";
import { registerCodeButtonBlock } from "./CodeButtonBlock.ts";
import { downloadEsbuild } from "./esbuild.ts";

export default class FixRequireModulesPlugin extends Plugin {
  public readonly builtInModuleNames = Object.freeze(builtInModuleNames);
  private _settings: FixRequireModulesSettings = new FixRequireModulesSettings();

  public get settings(): FixRequireModulesSettings {
    return FixRequireModulesSettings.clone(this._settings);
  }

  public override async onload(): Promise<void> {
    await this.loadSettings();
    registerCodeButtonBlock(this);
    this.app.workspace.onLayoutReady(this.onLayoutReady.bind(this));
  }

  public async saveSettings(newSettings: FixRequireModulesSettings): Promise<void> {
    this._settings = FixRequireModulesSettings.clone(newSettings);
    await this.saveData(this._settings);
    await registerInvocableScripts(this);
  }

  private async onLayoutReady(): Promise<void> {
    await downloadEsbuild(this);
    registerCustomRequire(this, require);

    const uninstallerRegister = this.register.bind(this);
    registerDynamicImport(uninstallerRegister);

    this.addCommand({
      id: "invokeScript",
      name: "Invoke Script: <<Choose>>",
      callback: () => selectAndInvokeScript(this.app, this.settings.getInvocableScriptsDirectory())
    });

    this.register(stopWatcher);

    this.addSettingTab(new FixRequireModulesSettingsTab(this));

    await this.saveSettings(this._settings);

    if (!this.settings.startupScriptPath) {
      console.warn("No Startup script path specified in the settings");
    } else {
      await invoke(this.app, this.settings.getStartupScriptPath(), true);
    }
  }

  private async loadSettings(): Promise<void> {
    this._settings = await this.loadData() ?? new FixRequireModulesSettings();
  }
}
