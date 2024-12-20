import type {
  App,
  MarkdownPostProcessorContext,
  Plugin
} from 'obsidian';

import babel from '@babel/core';
import babelPluginTransformModulesCommonJS from '@babel/plugin-transform-modules-commonjs';
import babelPresetTypeScript from '@babel/preset-typescript';
import { getCodeBlockArguments } from 'obsidian-dev-utils/obsidian/MarkdownCodeBlockProcessor';
import { join } from 'obsidian-dev-utils/Path';

import { babelPluginFixSourceMap } from './babel/babelPluginFixSourceMap.ts';
import { babelPluginWrapInDefaultAsyncFunction } from './babel/babelPluginWrapInDefaultAsyncFunction.ts';
import { customRequire } from './CustomRequire.ts';
import { printError } from './util/Error.ts';
import { convertPathToObsidianUrl } from './util/obsidian.ts';

type CodeButtonBlockScriptWrapper = () => Promise<void>;

const CODE_BUTTON_BLOCK_LANGUAGE = 'code-button';

export function registerCodeButtonBlock(plugin: Plugin): void {
  registerCodeHighlighting();
  plugin.register(unregisterCodeHighlighting);
  plugin.registerMarkdownCodeBlockProcessor(CODE_BUTTON_BLOCK_LANGUAGE,
    (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): void => { processCodeButtonBlock(plugin.app, source, el, ctx); }
  );
}

async function handleClick(app: App, resultEl: HTMLPreElement, sourcePath: string, source: string): Promise<void> {
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
    await codeButtonBlockScriptWrapper();
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

function processCodeButtonBlock(app: App, source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): void {
  const sectionInfo = ctx.getSectionInfo(el);

  if (sectionInfo) {
    const [
      caption = '(no caption)'
    ] = getCodeBlockArguments(ctx, el);

    el.createEl('button', {
      cls: 'mod-cta',
      async onclick(): Promise<void> {
        await handleClick(app, resultEl, ctx.sourcePath, source);
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

function unregisterCodeHighlighting(): void {
  window.CodeMirror.defineMode(CODE_BUTTON_BLOCK_LANGUAGE, (config) => window.CodeMirror.getMode(config, 'null'));
}
