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
  setPluginRequire,
} from "./CustomRequire.ts";
import FixRequireModulesSettingsTab from "./FixRequireModulesSettingsTab.ts";
import FixRequireModulesSettings from "./FixRequireModulesSettings.ts";
import { processCodeButtonBlock } from "./code-button.ts";
import {
  invoke,
  registerScripts,
  selectAndInvokeScript,
  stopWatcher
} from "./Script.ts";
import {
  dirname,
  join
} from "node:path";

export default class FixRequireModulesPlugin extends Plugin {
  public readonly builtInModuleNames = Object.freeze(builtInModuleNames);
  private _settings!: FixRequireModulesSettings;

  public get settings(): Readonly<FixRequireModulesSettings> {
    return Object.freeze(this._settings);
  }

  public override async onload(): Promise<void> {
    await this.downloadEsbuild();

    setPluginRequire(require);
    initPluginVariables(this);
    initTsx(this);
    applyPatches(this.register.bind(this));
    this.app.workspace.onLayoutReady(this.onLayoutReady.bind(this));

    this.addCommand({
      id: "invokeScript",
      name: "Invoke Script: <<Choose>>",
      callback: () => selectAndInvokeScript(this.app, this.settings.scriptsDirectory)
    });

    const CODE_BLOCK_LANGUAGE = "code-button";
    window.CodeMirror.defineMode(CODE_BLOCK_LANGUAGE, config => window.CodeMirror.getMode(config, "text/typescript"));
    this.register(() => {
      window.CodeMirror.defineMode(CODE_BLOCK_LANGUAGE, config => window.CodeMirror.getMode(config, "null"));
    });

    this.registerMarkdownCodeBlockProcessor(CODE_BLOCK_LANGUAGE, (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): void => processCodeButtonBlock(source, el, ctx, this.app));

    this.register(stopWatcher);
  }

  private async onLayoutReady(): Promise<void> {
    await this.loadSettings();
    this.addSettingTab(new FixRequireModulesSettingsTab(this));
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
