import {
  Notice,
  Plugin,
  requestUrl,
  type MarkdownPostProcessorContext
} from "obsidian";
import {
  applyPatches,
  builtInModuleNames,
  initPluginVariables,
  initTsx,
  setModuleRoot,
  setPluginRequire,
} from "./CustomRequire.ts";
import FixRequireModulesSettingsTab from "./FixRequireModulesSettingsTab.ts";
import FixRequireModulesSettings from "./FixRequireModulesSettings.ts";
import { processCodeButtonBlock } from "./code-button.ts";
import {
  invoke,
  registerInvocableScripts,
  selectAndInvokeScript,
  stopWatcher
} from "./Script.ts";
import {
  dirname,
  join
} from "node:path";

export default class FixRequireModulesPlugin extends Plugin {
  public readonly builtInModuleNames = Object.freeze(builtInModuleNames);
  private _settings: FixRequireModulesSettings = new FixRequireModulesSettings();

  public get settings(): FixRequireModulesSettings {
    return FixRequireModulesSettings.clone(this._settings);
  }

  public override onload(): void {
    this.app.workspace.onLayoutReady(this.onLayoutReady.bind(this));

    const CODE_BLOCK_LANGUAGE = "code-button";
    window.CodeMirror.defineMode(CODE_BLOCK_LANGUAGE, config => window.CodeMirror.getMode(config, "text/typescript"));
    this.register(() => {
      window.CodeMirror.defineMode(CODE_BLOCK_LANGUAGE, config => window.CodeMirror.getMode(config, "null"));
    });

    this.registerMarkdownCodeBlockProcessor(CODE_BLOCK_LANGUAGE, (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): void => processCodeButtonBlock(source, el, ctx, this.app));
  }

  private async onLayoutReady(): Promise<void> {
    await this.downloadEsbuild();

    initPluginVariables(this);
    await this.loadSettings();

    const uninstallerRegister = this.register.bind(this);

    setPluginRequire(require);
    initTsx(uninstallerRegister);
    applyPatches(uninstallerRegister);

    this.addCommand({
      id: "invokeScript",
      name: "Invoke Script: <<Choose>>",
      callback: () => selectAndInvokeScript(this.app, this.settings.getInvocableScriptsDirectory())
    });

    this.register(stopWatcher);

    this.addSettingTab(new FixRequireModulesSettingsTab(this));

    if (!this.settings.startupScriptPath) {
      console.warn("No Startup script path specified in the settings");
    } else {
      await invoke(this.app, this.settings.getStartupScriptPath(), true);
    }
  }

  public async saveSettings(newSettings: FixRequireModulesSettings): Promise<void> {
    this._settings = FixRequireModulesSettings.clone(newSettings);
    await this.saveData(this._settings);
    await registerInvocableScripts(this);
    setModuleRoot(this._settings.modulesRoot);
  }

  private async loadSettings(): Promise<void> {
    const settings = await this.loadData() as FixRequireModulesSettings | undefined;
    await this.saveSettings(settings ?? new FixRequireModulesSettings());
  }

  private async downloadEsbuild(): Promise<void> {
    const assets = {
      "node_modules/esbuild/lib/main.js": "https://unpkg.com/esbuild@0.21.4/lib/main.js",
      "node_modules/@esbuild/win32-x64/esbuild.exe": "https://unpkg.com/@esbuild/win32-x64@0.21.4/esbuild.exe"
    } as Record<string, string>;

    for (const [path, url] of Object.entries(assets)) {
      const fullPath = join(this.manifest.dir!, path);
      if (await this.app.vault.adapter.exists(fullPath)) {
        continue;
      }

      const notice = new Notice("In order to use this plugin, we need to download some esbuild assets. This will only happen once. Please wait...");

      const response = await requestUrl(url);
      if (response.status !== 200) {
        const message = `Failed to download ${url}. Disabling the plugin...`;
        new Notice(message);
        console.error(message);
        await this.app.plugins.disablePlugin(this.manifest.id);
      }

      const dir = dirname(fullPath);
      if (!await this.app.vault.adapter.exists(dir)) {
        await this.app.vault.adapter.mkdir(dir);
      }
      await this.app.vault.adapter.writeBinary(fullPath, response.arrayBuffer);
      notice.hide();
    }
  }
}
