import { join } from "path";
import {
  invoke,
  printError,
  type Invocable,
  type Script
} from "./Script.ts";

import type {
  App,
  Plugin
} from "obsidian";
import ScriptSelectorModal from "./ScriptSelectorModal.ts";

export type Config = {
  startup: Invocable;
  scripts: Script[];
}

let isStartupScriptInvoked = false;

const sampleConfig: Config = {
  startup: () => {
    console.log("`Fix Require Modules` plugin's startup script. See README.md for more information.");
  },
  scripts: [
    {
      name: "Sync script",
      invoke: (): void => {
        console.log("`Fix Require Modules` plugin's sync script. See README.md for more information.");
      }
    },
    {
      name: "Async script",
      invoke: async (): Promise<void> => {
        await Promise.resolve();
        console.log("`Fix Require Modules` plugin's async script. See README.md for more information.");
      }
    }
  ]
};

export async function selectAndInvokeScript(app: App, scripts: Script[]): Promise<void> {
  const scriptName = await ScriptSelectorModal.select(app, scripts.map(s => s.name));
  if (scriptName === null) {
    console.debug("No script selected");
    return;
  }

  const script = scripts.find(script => script.name === scriptName)!;
  await invoke(script);
}

export async function loadConfig(plugin: Plugin): Promise<void> {
  const config = await readConfig();

  if (!isStartupScriptInvoked) {
    const startupScript = {
      name: "Startup",
      invoke: config.startup
    };

    await invoke(startupScript);
    isStartupScriptInvoked = true;
  }

  const commands = plugin.app.commands.listCommands().filter(c => c.id.startsWith(`${plugin.manifest.id}:`));
  for (const command of commands) {
    plugin.app.commands.removeCommand(command.id);
  }

  plugin.addCommand({
    id: "invokeScript",
    name: "Invoke Script <<Choose>>",
    callback: () => selectAndInvokeScript(app, config.scripts),
  });

  for (const script of config.scripts) {
    plugin.addCommand({
      id: `invoke-${script.name}`,
      name: `Invoke Script ${script.name}`,
      callback: async () => {
        await invoke(script);
      }
    });
  }

  async function readConfig(): Promise<Config> {
    const configPath = join(plugin.manifest.dir!, "config.ts");

    let config: Config;
    if (!await plugin.app.vault.adapter.exists(configPath)) {
      console.warn("Config file not found. Using sample config instead.");
      return sampleConfig;
    }

    try {
      config = window.require("/" + configPath) as Config;
    } catch (error) {
      printError(new Error("Error loading config file. Using sample config instead.", { cause: error }));
      return sampleConfig;
    }

    const set = new Set<string>();

    for (const script of config!.scripts) {
      if (set.has(script.name)) {
        console.error(`Invalid config file. Duplicate script name: ${script.name}. Using sample config instead.`);
        return sampleConfig;
      }
    }

    return config;
  }
}
