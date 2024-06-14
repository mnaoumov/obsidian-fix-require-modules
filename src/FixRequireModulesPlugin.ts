import { Plugin } from "obsidian";
import { loadConfig } from "./Config.ts";
import {
  applyPatches,
  builtInModuleNames,
  initPluginVariables,
  initTsx,
  setPluginRequire,
} from "./CustomRequire.ts";

export default class FixRequireModulesPlugin extends Plugin {
  public readonly builtInModuleNames = Object.freeze(builtInModuleNames);

  public override async onload(): Promise<void> {
    setPluginRequire(require);
    initPluginVariables(this);
    initTsx(this);
    applyPatches(this.register.bind(this));

    this.app.workspace.onLayoutReady(async() => {
      await loadConfig(this);
    });
  }
}
