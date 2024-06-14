import {
  Plugin,
  type MarkdownPostProcessorContext
} from "obsidian";
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
import { processCodeButtonBlock } from "./code-button.ts";

export default class FixRequireModulesPlugin extends Plugin {
  public readonly builtInModuleNames = Object.freeze(builtInModuleNames);
  private _settings!: FixRequireModulesSettings;

  public get settings(): Readonly<FixRequireModulesSettings> {
    return Object.freeze(this._settings);
  }

  public async updateSettings(newSettings: Partial<FixRequireModulesSettings>): Promise<void> {
    this._settings = Object.assign(new FixRequireModulesSettings(), this._settings, newSettings);
    await this.saveData(this._settings);
    await loadConfig(this);
  }

  public override onload(): void {
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
    this.registerMarkdownCodeBlockProcessor("code-button", (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): void => processCodeButtonBlock(source, el, ctx, this.app));
  }

  private async loadSettings(): Promise<void> {
    const settings = await this.loadData() as FixRequireModulesSettings | undefined;
    this._settings = Object.assign(new FixRequireModulesSettings(), settings);
  }
}
