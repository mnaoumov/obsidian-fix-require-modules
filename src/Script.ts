import type {
  App,
  DataAdapter
} from 'obsidian';
import type { MaybePromise } from 'obsidian-dev-utils/Async';

import { Notice } from 'obsidian';
import { selectItem } from 'obsidian-dev-utils/obsidian/Modal/SelectItem';
import { basename } from 'obsidian-dev-utils/Path';

import type { CodeScriptToolkitPlugin } from './CodeScriptToolkitPlugin.ts';

import { requireVaultScriptAsync } from './RequireHandlerUtils.ts';
import { printError } from './util/Error.ts';

interface CleanupScript extends Script {
  cleanup(app: App): MaybePromise<void>;
}

interface Script {
  invoke(app: App): MaybePromise<void>;
}

const extensions = ['.js', '.cjs', '.mjs', '.ts', '.cts', '.mts'];

export async function cleanupStartupScript(plugin: CodeScriptToolkitPlugin): Promise<void> {
  if (!plugin.settingsCopy.startupScriptPath) {
    return;
  }

  const startupScriptPath = plugin.settingsCopy.getStartupScriptPath();
  const script = await requireVaultScriptAsync(startupScriptPath) as Partial<CleanupScript>;
  await script.cleanup?.(plugin.app);
}

export async function invokeStartupScript(plugin: CodeScriptToolkitPlugin): Promise<void> {
  if (!plugin.settingsCopy.startupScriptPath) {
    return;
  }

  await invoke(plugin.app, plugin.settingsCopy.getStartupScriptPath(), true);
}

export async function registerInvocableScripts(plugin: CodeScriptToolkitPlugin): Promise<void> {
  const COMMAND_NAME_PREFIX = 'invokeScriptFile-';
  const commands = plugin.app.commands.listCommands().filter((c) => c.id.startsWith(`${plugin.manifest.id}:${COMMAND_NAME_PREFIX}`));
  for (const command of commands) {
    plugin.app.commands.removeCommand(command.id);
  }

  const invocableScriptsDirectory = plugin.settingsCopy.getInvocableScriptsDirectory();

  if (!invocableScriptsDirectory) {
    return;
  }

  if (!await plugin.app.vault.adapter.exists(invocableScriptsDirectory)) {
    const message = `Invocable scripts directory not found: ${invocableScriptsDirectory}`;
    new Notice(message);
    console.error(message);
    return;
  }

  const scriptFiles = await getAllScriptFiles(plugin.app.vault.adapter, plugin.settingsCopy.getInvocableScriptsDirectory(), '');

  for (const scriptFile of scriptFiles) {
    plugin.addCommand({
      callback: async () => {
        await invoke(plugin.app, `${invocableScriptsDirectory}/${scriptFile}`);
      },
      id: `${COMMAND_NAME_PREFIX}${scriptFile}`,
      name: `Invoke Script: ${scriptFile}`
    });
  }
}

export async function selectAndInvokeScript(plugin: CodeScriptToolkitPlugin): Promise<void> {
  const app = plugin.app;
  const invocableScriptsDirectory = plugin.settingsCopy.getInvocableScriptsDirectory();
  let scriptFiles: string[];

  if (!invocableScriptsDirectory) {
    scriptFiles = ['Error: No Invocable scripts directory specified in the settings'];
  } else if (!await app.vault.adapter.exists(invocableScriptsDirectory)) {
    scriptFiles = [`Error: Invocable scripts directory not found: ${invocableScriptsDirectory}`];
  } else {
    scriptFiles = await getAllScriptFiles(app.vault.adapter, invocableScriptsDirectory, '');
  }

  const scriptFile = await selectItem({
    app: app,
    items: scriptFiles,
    itemTextFunc: (script) => script,
    placeholder: 'Choose a script to invoke'
  });

  if (scriptFile === null) {
    console.debug('No script selected');
    return;
  }

  if (!scriptFile.startsWith('Error:')) {
    await invoke(app, `${invocableScriptsDirectory}/${scriptFile}`);
  }
}

async function getAllScriptFiles(adapter: DataAdapter, scriptsDirectory: string, directory: string): Promise<string[]> {
  const files: string[] = [];
  const listedFiles = await adapter.list(`${scriptsDirectory}/${directory}`);
  for (const fileName of getSortedBaseNames(listedFiles.files)) {
    const lowerCasedFileName = fileName.toLowerCase();
    if (extensions.some((ext) => lowerCasedFileName.endsWith(ext))) {
      files.push(directory ? `${directory}/${fileName}` : fileName);
    }
  }
  for (const directoryName of getSortedBaseNames(listedFiles.folders)) {
    const subFiles = await getAllScriptFiles(adapter, scriptsDirectory, directory ? `${directory}/${directoryName}` : directoryName);
    files.push(...subFiles);
  }

  return files;
}

function getSortedBaseNames(fullNames: string[]): string[] {
  return fullNames.map((file) => basename(file)).sort((a, b) => a.localeCompare(b));
}

async function invoke(app: App, scriptPath: string, isStartup?: boolean): Promise<void> {
  const scriptString = isStartup ? 'startup script' : 'script';
  console.debug(`Invoking ${scriptString}: ${scriptPath}`);
  try {
    if (!await app.vault.adapter.exists(scriptPath)) {
      throw new Error(`Script not found: ${scriptPath}`);
    }
    const script = await requireVaultScriptAsync(scriptPath) as Partial<Script>;
    const invokeFn = script.invoke?.bind(script);
    if (typeof invokeFn !== 'function') {
      throw new Error(`${scriptPath} does not export a function`);
    }
    await invokeFn(app);
    console.debug(`${scriptString} ${scriptPath} executed successfully`);
  } catch (error) {
    new Notice(`Error invoking ${scriptString} ${scriptPath}
See console for details...`);
    printError(new Error(`Error invoking ${scriptString} ${scriptPath}`, { cause: error }));
  }
}
