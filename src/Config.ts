import {
  invoke,
  type Script
} from "./Script.ts";

import type { Plugin } from "obsidian";
import selectItem from "./select-item.ts";
import type FixRequireModulesPlugin from "./FixRequireModulesPlugin.ts";
import { printError } from "./Error.ts";

type Config = Script[];

type ConfigModule = Config | { default: Config };

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

export async function loadConfig(plugin: FixRequireModulesPlugin): Promise<void> {
  const config = await readConfig(plugin);

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
        const updatedConfig = await readConfig(plugin);
        const updatedScript = updatedConfig.find(s => s.name === script.name) ?? {
          name: script.name,
          invoke: (): void => {
            throw new Error(`Script not found: ${script.name}`);
          }
        };

        await invoke(updatedScript);
      }
    });
  }

  async function readConfig(plugin: FixRequireModulesPlugin): Promise<Config> {
    const configPath = plugin.settings.configPath;

    if (!configPath) {
      console.warn("No config path specified. Using sample config instead.");
      return sampleConfig;
    }

    if (!(await plugin.app.vault.adapter.exists(configPath))) {
      console.warn(`Config was not found at ${configPath}. Using sample config instead.`);
      return sampleConfig;
    }

    let configModule: ConfigModule;

    try {
      configModule = window.require("/" + configPath) as ConfigModule;
    } catch (error) {
      printError(new Error("Error loading config file. Using sample config instead.", { cause: error }));
      return sampleConfig;
    }

    const config: Config = "default" in configModule ? configModule.default : configModule;

    const set = new Set<string>();

    for (const script of config) {
      if (set.has(script.name)) {
        console.error(`Invalid config file. Duplicate script name: ${script.name}. Using sample config instead.`);
        return sampleConfig;
      }

      set.add(script.name);
    }

    return config;
  }
}
