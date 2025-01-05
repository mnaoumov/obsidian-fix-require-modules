import type {
  App,
  MarkdownPostProcessorContext,
  PluginManifest
} from 'obsidian';
import type { MaybePromise } from 'obsidian-dev-utils/Async';

import { Plugin } from 'obsidian';
import { getCodeBlockArguments } from 'obsidian-dev-utils/obsidian/MarkdownCodeBlockProcessor';
import {
  basename,
  dirname
} from 'obsidian-dev-utils/Path';

import { SequentialBabelPlugin } from './babel/CombineBabelPlugins.ts';
import { ConvertToCommonJsBabelPlugin } from './babel/ConvertToCommonJsBabelPlugin.ts';
import { WrapInDefaultAsyncFunctionBabelPlugin } from './babel/WrapInDefaultAsyncFunctionBabelPlugin.ts';
import { requireStringAsync } from './RequireHandlerUtils.ts';
import { printError } from './util/Error.ts';

type CodeButtonBlockScriptWrapper = (registerTempPlugin: RegisterTempPluginFn) => MaybePromise<void>;
type RegisterTempPluginFn = (tempPluginClass: TempPluginClass) => void;
type TempPluginClass = new (app: App, manifest: PluginManifest) => Plugin;

const CODE_BUTTON_BLOCK_LANGUAGE = 'code-button';
const tempPlugins = new Map<string, Plugin>();

export function registerCodeButtonBlock(plugin: Plugin): void {
  registerCodeHighlighting();
  plugin.register(unregisterCodeHighlighting);
  plugin.registerMarkdownCodeBlockProcessor(CODE_BUTTON_BLOCK_LANGUAGE,
    (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): void => { processCodeButtonBlock(plugin, source, el, ctx); }
  );
}

export function unloadTempPlugins(): void {
  for (const tempPlugin of tempPlugins.values()) {
    tempPlugin.unload();
  }
}

async function handleClick(plugin: Plugin, resultEl: HTMLPreElement, sourcePath: string, source: string, caption: string, buttonIndex: number): Promise<void> {
  resultEl.empty();
  resultEl.setText('Executing...⌛');

  try {
    const script = makeWrapperScript(source, `${basename(sourcePath)}:code-button:${buttonIndex.toString()}:${caption}`, dirname(sourcePath));
    const codeButtonBlockScriptWrapper = await requireStringAsync(script, plugin.app.vault.adapter.getFullPath(sourcePath).replaceAll('\\', '/'), `code-button:${buttonIndex.toString()}:${caption}`) as CodeButtonBlockScriptWrapper;
    await codeButtonBlockScriptWrapper((tempPluginClass) => {
      registerTempPlugin(plugin, tempPluginClass);
    });
    resultEl.setText('Done! ✅');
  } catch (error) {
    resultEl.setText('Error! ❌\nSee console for details...');
    printError(new Error('Error executing code block', { cause: error }));
  }
}

function makeWrapperScript(source: string, sourceFileName: string, sourceDir: string): string {
  const result = new SequentialBabelPlugin([
    new ConvertToCommonJsBabelPlugin(),
    new WrapInDefaultAsyncFunctionBabelPlugin()
  ]).transform(source, sourceFileName, sourceDir);

  if (result.error) {
    throw result.error;
  }

  return result.transformedCode;
}

function processCodeButtonBlock(plugin: Plugin, source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): void {
  const sectionInfo = ctx.getSectionInfo(el);

  if (sectionInfo) {
    const [
      caption = '(no caption)'
    ] = getCodeBlockArguments(ctx, el);

    const lines = sectionInfo.text.split('\n');
    const previousLines = lines.slice(0, sectionInfo.lineStart);
    const previousText = previousLines.join('\n');
    const buttonIndex = Array.from(previousText.matchAll(new RegExp(`^\`{3,}${CODE_BUTTON_BLOCK_LANGUAGE}`, 'gm'))).length;

    el.createEl('button', {
      cls: 'mod-cta',
      async onclick(): Promise<void> {
        await handleClick(plugin, resultEl, ctx.sourcePath, source, caption, buttonIndex);
      },
      text: caption
    });
  }

  const resultEl = el.createEl('pre');

  if (!sectionInfo) {
    resultEl.textContent = 'Error! ❌\nCould not get code block info. Try to reopen the note...';
  }
}

function registerCodeHighlighting(): void {
  window.CodeMirror.defineMode(CODE_BUTTON_BLOCK_LANGUAGE, (config) => window.CodeMirror.getMode(config, 'text/typescript'));
}

function registerTempPlugin(plugin: Plugin, tempPluginClass: TempPluginClass): void {
  const app = plugin.app;
  const id = `__temp-plugin-${tempPluginClass.name}`;

  const existingPlugin = tempPlugins.get(id);
  if (existingPlugin) {
    existingPlugin.unload();
  }

  const tempPlugin = new tempPluginClass(app, {
    author: '__Temp Plugin created by Fix Require Modules',
    description: '__Temp Plugin created by Fix Require Modules',
    id,
    minAppVersion: '0.0.1',
    name: '__Temp Plugin ${name}',
    version: '0.0.0'
  });

  const unloadCommandId = `unload-temp-plugin-${tempPluginClass.name}`;

  tempPlugin.register(() => {
    tempPlugins.delete(id);
    plugin.removeCommand(unloadCommandId);
    new Notice(`Unloaded Temp Plugin: ${tempPluginClass.name}`);
  });

  tempPlugins.set(id, tempPlugin);
  plugin.addChild(tempPlugin);
  new Notice(`Loaded Temp Plugin: ${tempPluginClass.name}`);

  plugin.addCommand({
    callback: () => {
      tempPlugin.unload();
    },
    id: unloadCommandId,
    name: `Unload Temp Plugin: ${tempPluginClass.name}`
  });
}

function unregisterCodeHighlighting(): void {
  window.CodeMirror.defineMode(CODE_BUTTON_BLOCK_LANGUAGE, (config) => window.CodeMirror.getMode(config, 'null'));
}
