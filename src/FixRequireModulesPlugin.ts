import { Plugin } from "obsidian";
import { loadConfig } from "./Config.ts";
import {
  applyPatches,
  builtInModuleNames,
  initPluginVariables,
  initTsx,
  setPluginRequire,
} from "./CustomRequire.ts";
import FixRequireModulesSettingsTab from "./FixRequireModulesSettingsTab.ts";
import FixRequireModulesSettings from "./FixRequireModulesSettings.ts";

export default class FixRequireModulesPlugin extends Plugin {
  public readonly builtInModuleNames = Object.freeze(builtInModuleNames);
  private _settings!: FixRequireModulesSettings;

  public get settings(): Readonly<FixRequireModulesSettings> {
    return Object.freeze(this._settings);
  }

  public async updateSettings(newSettings: Partial<FixRequireModulesSettings>): Promise<void> {
    this._settings = Object.assign(this._settings, newSettings);
    await this.saveData(this._settings);
    await loadConfig(this);
  }

  public override async onload(): Promise<void> {
    setPluginRequire(require);
    initPluginVariables(this);
    initTsx(this);
    applyPatches(this.register.bind(this));
    this.app.workspace.onLayoutReady(this.onLayoutReady.bind(this));
  }

  private async onLayoutReady(): Promise<void> {
    await this.loadSettings();
    this.addSettingTab(new FixRequireModulesSettingsTab(this));
    await this.updateSettings({});
  }

  private async loadSettings() {
    const settings = await this.loadData();
    this._settings = Object.assign(new FixRequireModulesSettings(), settings)
  }
}
