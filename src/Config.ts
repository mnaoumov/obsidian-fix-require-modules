import { join } from "path";
import {
  invoke,
  printError,
  type Script
} from "./Script.ts";

import type { Plugin } from "obsidian";
import selectItem from "./select-item.ts";

type Config = Script[];

let isStartupScriptInvoked = false;

const sampleConfig: Config = [
  {
    name: "Sample sync startup script",
    invoke: (): void => {
      console.log("This is a Sample sync startup script. See README.md for more information.");
    },
    isStartupScript: true
  },
  {
    name: "Sample async script",
    invoke: async (): Promise<void> => {
      await Promise.resolve();
      console.log("This is a Sample async script. See README.md for more information.");
    }
  }
];

async function selectAndInvokeScript(plugin: Plugin, config: Config): Promise<void> {
  const script = await selectItem({
    app: plugin.app,
    items: config,
    itemTextFunc: script => script.name,
    placeholder: "Choose a script to invoke"
  });

  if (script === null) {
    console.debug("No script selected");
    return;
  }

  await invoke(script);
}

export async function loadConfig(plugin: Plugin): Promise<void> {
  const config = await readConfig();

  if (!isStartupScriptInvoked) {
    isStartupScriptInvoked = true;

    for (const startupScript of config.filter(script => script.isStartupScript)) {
      await invoke(startupScript);
    }
  }

  const commands = plugin.app.commands.listCommands().filter(c => c.id.startsWith(`${plugin.manifest.id}:`));
  for (const command of commands) {
    plugin.app.commands.removeCommand(command.id);
  }

  plugin.addCommand({
    id: "invokeScript",
    name: "Invoke Script <<Choose>>",
    callback: () => selectAndInvokeScript(plugin, config)
  });

  for (const script of config) {
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

    for (const script of config) {
      if (set.has(script.name)) {
        console.error(`Invalid config file. Duplicate script name: ${script.name}. Using sample config instead.`);
        return sampleConfig;
      }
    }

    return config;
  }
}
