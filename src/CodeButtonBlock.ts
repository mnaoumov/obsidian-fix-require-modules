import type {
  App,
  MarkdownPostProcessorContext,
  PluginManifest
} from 'obsidian';
import type { MaybePromise } from 'obsidian-dev-utils/Async';

import babel from '@babel/core';
import babelPluginTransformModulesCommonJS from '@babel/plugin-transform-modules-commonjs';
import babelPresetTypeScript from '@babel/preset-typescript';
import { Plugin } from 'obsidian';
import { getCodeBlockArguments } from 'obsidian-dev-utils/obsidian/MarkdownCodeBlockProcessor';
import { join } from 'obsidian-dev-utils/Path';

import { babelPluginFixSourceMap } from './babel/babelPluginFixSourceMap.ts';
import { babelPluginWrapInDefaultAsyncFunction } from './babel/babelPluginWrapInDefaultAsyncFunction.ts';
import { customRequire } from './CustomRequire.ts';
import { printError } from './util/Error.ts';
import { convertPathToObsidianUrl } from './util/obsidian.ts';

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

async function handleClick(plugin: Plugin, resultEl: HTMLPreElement, sourcePath: string, source: string): Promise<void> {
  const app = plugin.app;
  resultEl.empty();
  resultEl.setText('Executing...⌛');

  const noteFile = app.vault.getAbstractFileByPath(sourcePath);
  const dir = noteFile?.parent;
  const dirPath = dir?.path ?? '';
  const randomName = Math.random().toString(36).slice(2, 15);
  const codeButtonBlockScriptFileName = `.code-button-block-script-${randomName}.mts`;
  const codeButtonBlockScriptPath = join(dirPath, codeButtonBlockScriptFileName);
  await app.vault.create(codeButtonBlockScriptPath, source);
  const codeButtonBlockScriptWrapperFileName = `.code-button-block-script-wrapper-${randomName}.cjs`;
  const codeButtonBlockScriptWrapperPath = join(dirPath, codeButtonBlockScriptWrapperFileName);
  const sourceDir = app.vault.adapter.getFullPath(dirPath);
  const sourceUrl = convertPathToObsidianUrl(app.vault.adapter.getFullPath(codeButtonBlockScriptPath));

  try {
    const wrappedCode = await makeWrapperScript(source, codeButtonBlockScriptFileName, sourceDir, sourceUrl);
    await app.vault.create(codeButtonBlockScriptWrapperPath, wrappedCode);
    const codeButtonBlockScriptWrapper = customRequire(app.vault.adapter.getFullPath(codeButtonBlockScriptWrapperPath)) as CodeButtonBlockScriptWrapper;
    await codeButtonBlockScriptWrapper((tempPluginClass) => {
      registerTempPlugin(plugin, tempPluginClass);
    });
    resultEl.setText('Done! ✅');
  } catch (error) {
    resultEl.setText('Error! ❌\nSee console for details...');
    printError(new Error('Error executing code block', { cause: error }));
  } finally {
    for (const path of [codeButtonBlockScriptPath, codeButtonBlockScriptWrapperPath]) {
      if (await app.vault.adapter.exists(path)) {
        await app.vault.adapter.remove(path);
      }
    }
  }
}

async function makeWrapperScript(source: string, sourceFileName: string, sourceDir: string, sourceUrl: string): Promise<string> {
  let result = await babel.transformAsync(source, {
    cwd: sourceDir,
    filename: sourceFileName,
    plugins: [
      babelPluginTransformModulesCommonJS
    ],
    presets: [
      babelPresetTypeScript
    ],
    sourceMaps: 'inline'
  });

  result = await babel.transformAsync(result?.code ?? '', {
    cwd: sourceDir,
    filename: sourceFileName,
    plugins: [
      babelPluginWrapInDefaultAsyncFunction,
      [babelPluginFixSourceMap, { sourceUrl }]
    ],
    sourceMaps: 'inline'
  });

  return result?.code ?? '';
}

function processCodeButtonBlock(plugin: Plugin, source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): void {
  const sectionInfo = ctx.getSectionInfo(el);

  if (sectionInfo) {
    const [
      caption = '(no caption)'
    ] = getCodeBlockArguments(ctx, el);

    el.createEl('button', {
      cls: 'mod-cta',
      async onclick(): Promise<void> {
        await handleClick(plugin, resultEl, ctx.sourcePath, source);
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
