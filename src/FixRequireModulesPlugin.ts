import {
  Plugin,
} from "obsidian";
import {
  builtInModuleNames,
  registerCustomRequire
} from "./CustomRequire.ts";
import FixRequireModulesPluginSettingsTab from "./FixRequireModulesPluginSettingsTab.ts";
import FixRequireModulesPluginSettings from "./FixRequireModulesPluginSettings.ts";
import {
  invokeStartupScript,
  registerInvocableScripts,
  selectAndInvokeScript
} from "./Script.ts";
import { registerDynamicImport } from "./DynamicImport.ts";
import { registerCodeButtonBlock } from "./CodeButtonBlock.ts";
import { downloadEsbuild } from "./esbuild.ts";
import {
  watch,
  type FSWatcher,
  type WatchEventType
} from "node:fs";
import { printError } from "./util/Error.ts";
import { join } from "node:path";

export default class FixRequireModulesPlugin extends Plugin {
  public readonly builtInModuleNames = Object.freeze(builtInModuleNames);
  private _settings: FixRequireModulesPluginSettings = new FixRequireModulesPluginSettings();
  private _invocableScriptsDirectoryWatcher: FSWatcher | null = null;

  public get settings(): FixRequireModulesPluginSettings {
    return FixRequireModulesPluginSettings.clone(this._settings);
  }

  public override async onload(): Promise<void> {
    await this.loadSettings();
    registerCodeButtonBlock(this);
    this.addSettingTab(new FixRequireModulesPluginSettingsTab(this));
    this.addCommand({
      id: "invokeScript",
      name: "Invoke Script: <<Choose>>",
      callback: () => selectAndInvokeScript(this)
    });
    this.register(this.stopInvocableScriptsDirectoryWatcher.bind(this));
    this.app.workspace.onLayoutReady(this.onLayoutReady.bind(this));
  }

  public async saveSettings(newSettings: FixRequireModulesPluginSettings): Promise<void> {
    this._settings = FixRequireModulesPluginSettings.clone(newSettings);
    await this.saveData(this._settings);
    await registerInvocableScripts(this);
    this.configureInvocableScriptsDirectoryWatcher();
  }

  private async onLayoutReady(): Promise<void> {
    await downloadEsbuild(this);
    registerCustomRequire(this, require);
    registerDynamicImport(this);

    await this.saveSettings(this._settings);
    await invokeStartupScript(this);
  }

  private async loadSettings(): Promise<void> {
    this._settings = FixRequireModulesPluginSettings.load(await this.loadData());
  }

  /**
   * @note We have to create our own watcher and not rely on Vault.on("create"|"delete"|"rename") events because they are not fired for dot-directories.
   * We want to be able to track changes to the invocable scripts directory, even if it is a dot-directory.
   */
  private configureInvocableScriptsDirectoryWatcher(): void {
    this.stopInvocableScriptsDirectoryWatcher();

    if (!this.settings.getInvocableScriptsDirectory()){
      return;
    }

    const invocableScriptsDirectoryFullPath = join(this.app.vault.adapter.getBasePath(), this._settings.getInvocableScriptsDirectory());

    this._invocableScriptsDirectoryWatcher = watch(invocableScriptsDirectoryFullPath, { recursive: true }, (eventType: WatchEventType): void => {
      if (eventType === "rename") {
        registerInvocableScripts(this).catch(printError);
      }
    });
  }

  private stopInvocableScriptsDirectoryWatcher(): void {
    if (this._invocableScriptsDirectoryWatcher) {
      this._invocableScriptsDirectoryWatcher.close();
      this._invocableScriptsDirectoryWatcher = null;
    }
  }
}
