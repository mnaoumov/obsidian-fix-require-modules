import {
  Plugin,
  type MarkdownPostProcessorContext
} from "obsidian";
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
import {
  invoke,
  registerScripts,
  selectAndInvokeScript
} from "./Script.ts";

export default class FixRequireModulesPlugin extends Plugin {
  public readonly builtInModuleNames = Object.freeze(builtInModuleNames);
  private _settings!: FixRequireModulesSettings;

  public get settings(): Readonly<FixRequireModulesSettings> {
    return Object.freeze(this._settings);
  }

  public override onload(): void {
    setPluginRequire(require);
    initPluginVariables(this);
    initTsx(this);
    applyPatches(this.register.bind(this));
    this.app.workspace.onLayoutReady(this.onLayoutReady.bind(this));

    this.addCommand({
      id: "invokeScript",
      name: "Invoke Script <<Choose>>",
      callback: () => selectAndInvokeScript(this.app, this.settings.scriptsDirectory)
    });

    const CODE_BLOCK_LANGUAGE = "code-button";
    window.CodeMirror.defineMode(CODE_BLOCK_LANGUAGE, config => window.CodeMirror.getMode(config, "text/typescript"));
    this.register(() => {
      window.CodeMirror.defineMode(CODE_BLOCK_LANGUAGE, config => window.CodeMirror.getMode(config, "null"));
    })

    this.registerMarkdownCodeBlockProcessor(CODE_BLOCK_LANGUAGE, (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): void => processCodeButtonBlock(source, el, ctx, this.app));
  }

  private async onLayoutReady(): Promise<void> {
    await this.loadSettings();
    this.addSettingTab(new FixRequireModulesSettingsTab(this));
    await this.updateSettings({});
    await registerScripts(this);
    if (!this.settings.startupScriptPath) {
      console.warn("No startup script specified in the settings");
    } else {
      await invoke(this.app, this.settings.startupScriptPath, true);
    }
  }

  public async updateSettings(newSettings: Partial<FixRequireModulesSettings>): Promise<void> {
    const scriptsDirectory = this._settings.scriptsDirectory;
    this._settings = Object.assign(new FixRequireModulesSettings(), this._settings, newSettings);
    await this.saveData(this._settings);

    if (this.settings.scriptsDirectory !== scriptsDirectory) {
      await registerScripts(this);
    }
  }

  private async loadSettings(): Promise<void> {
    const settings = await this.loadData() as FixRequireModulesSettings | undefined;
    this._settings = Object.assign(new FixRequireModulesSettings(), settings);
  }
}
